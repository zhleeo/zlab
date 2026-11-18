---
date: '2026-11-06'
draft: false
title: 'I/O 模型编程实战：三种实现与差异化对比'
categories: ['技术']
tags: ['Netty', 'NIO', '网络编程', 'IO']
weight: 5
---

> 前置阅读：[I/O 模型原理]({{< ref "/posts/netty/network-io-models" >}}) — 建议先了解 BIO/NIO/epoll/Netty 的架构差异后再读本篇，否则代码中的一些设计选择（如自定义粘包解码）会缺少上下文。

---

## BIO——平台线程版

```java
ServerSocket serverSocket = new ServerSocket(8080);

while (true) {
    Socket socket = serverSocket.accept();  // ① accept() — 从 ACCEPT 队列取连接
    new Thread(() -> {
        try (InputStream in = socket.getInputStream();
             OutputStream out = socket.getOutputStream()) {
            byte[] buf = new byte[1024];
            int len;
            while ((len = in.read(buf)) != -1) {  // ② read() → recvfrom() — 阻塞等数据
                String msg = new String(buf, 0, len);
                Thread.sleep(10);                 // 模拟业务处理
                out.write(("Echo: " + msg).getBytes());
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }).start();  // ③ 每个连接创建一个 1MB 栈的平台线程
}
```

每行的底层代价：

| 行 | Java API | 系统调用 | 代价 |
|---|---|---|---|
| ① | `accept()` | `accept()` | 正常阻塞——队列空就等 |
| ② | `read()` | `recvfrom()` | 线程挂起 → CPU 上下文切换 → 数据到了再切回来 |
| ③ | `new Thread()` | `clone()` | 分配 ~1MB 栈 + TLB 刷新 + 调度器压力 |

**动手验证**：

```bash
# 创建 100 个连接但不发数据
for i in $(seq 1 100); do nc localhost 8080 & done

# 查线程数——每个 nc 对应一个 Java 线程在 recvfrom() 里挂着
jstack $(pgrep -f BioServer) | grep -c "Thread-"
```

---

## BIO——虚拟线程版（只改一行）

```java
ServerSocket serverSocket = new ServerSocket(8080);

while (true) {
    Socket socket = serverSocket.accept();
    Thread.startVirtualThread(() -> {        // ← 唯一改动
        try (var in = socket.getInputStream();
             var out = socket.getOutputStream()) {
            byte[] buf = new byte[1024];
            int len;
            while ((len = in.read(buf)) != -1) {  // 同样是阻塞的调用
                String msg = new String(buf, 0, len);
                Thread.sleep(10);
                out.write(("Echo: " + msg).getBytes());
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    });
}
```

| 维度 | 平台线程 BIO | 虚拟线程 BIO |
|---|---|---|
| 单连接内存 | ~1MB | ~1KB |
| 10 万连接内存 | 直接 OOM | ~100MB |
| `read()` 阻塞时 | 平台线程挂起 | 平台线程卸下，跑别的虚拟线程 |
| 编程模型 | 同步 | **不变** |
| 调度者 | OS 内核 | JVM（ForkJoinPool） |

**虚拟线程的已知限制**：JDK 24 的 JEP 491 已基本消除 `synchronized` 的 pinning 问题。残留 pinning 仅存在于 JNI 调用和 Linux 本地文件 I/O 场景。JDK 21-23 用户仍需用 `ReentrantLock` 替代 `synchronized`。

---

## 原生 NIO——为什么没人直接用它上生产

```java
Selector selector = Selector.open();

ServerSocketChannel serverChannel = ServerSocketChannel.open();
serverChannel.configureBlocking(false);
serverChannel.bind(new InetSocketAddress(8080));
serverChannel.register(selector, SelectionKey.OP_ACCEPT);  // epoll_ctl(ADD)

while (true) {
    selector.select();  // epoll_wait() — 阻塞等事件

    Iterator<SelectionKey> iter = selector.selectedKeys().iterator();
    while (iter.hasNext()) {
        SelectionKey key = iter.next();
        iter.remove();  // 忘 remove = 事件重复处理

        if (key.isAcceptable()) {
            ServerSocketChannel ssc = (ServerSocketChannel) key.channel();
            SocketChannel client = ssc.accept();
            client.configureBlocking(false);               // 必须设置
            client.register(selector, SelectionKey.OP_READ);
        } else if (key.isReadable()) {
            SocketChannel client = (SocketChannel) key.channel();
            ByteBuffer buffer = ByteBuffer.allocate(1024);
            int len = client.read(buffer);
            if (len == -1) { client.close(); return; }

            buffer.flip();  // write mode → read mode — 容易忘
            byte[] data = new byte[buffer.remaining()];
            buffer.get(data);

            ByteBuffer resp = ByteBuffer.wrap(("Echo: " + new String(data)).getBytes());
            while (resp.hasRemaining()) {
                int w = client.write(resp);  // Socket 发送缓冲满了 → 返回 0
                if (w == 0) {
                    // 正确的做法：注册 OP_WRITE，等可写事件
                    // 但这里为简洁省略了——这是又一个坑
                }
            }
        }
    }
}
```

五个生产级坑：

| 问题 | 位置 | 后果 |
|---|---|---|
| Buffer 的 flip/clear 状态 | `buffer.flip()` | 忘 flip → 读不到数据。多段读写时状态管理极易出错 |
| epoll 空轮询 bug | `selector.select()` | Linux 下 Selector 虚假唤醒，`select()` 秒返 0 → CPU 100% |
| 半包/粘包 | `client.read()` | TCP 是字节流，一次 read 可能读到半条消息或两条消息 |
| 写缓冲区溢出 | `client.write()` | Socket 发送缓冲区满时返回 0，while 循环变成忙等 |
| SelectedKey 重复处理 | `iter.remove()` | 忘 remove → 同一个事件被处理多次 |

**Netty 存在的根本意义就是把以上五个坑全部填上**——你不能也不应该在生产环境直接写原生 NIO。

---

## Netty——把 NIO 的坑填平

基于 **Netty 4.2.20.Final**（2026-11-02 最新稳定版，4.1.x 将于 2027-07-01 EOL）。

### 服务端启动

```java
EventLoopGroup bossGroup = new NioEventLoopGroup(1);
EventLoopGroup workerGroup = new NioEventLoopGroup();

try {
    ServerBootstrap b = new ServerBootstrap();
    b.group(bossGroup, workerGroup)
     .channel(NioServerSocketChannel.class)
     .childHandler(new ChannelInitializer<SocketChannel>() {
         @Override
         protected void initChannel(SocketChannel ch) {
             ch.pipeline()
                 .addLast(new LengthFieldBasedFrameDecoder(65535, 0, 4, 0, 4))
                 .addLast(new StringDecoder(StandardCharsets.UTF_8))
                 .addLast(new StringEncoder(StandardCharsets.UTF_8))
                 .addLast(new EchoServerHandler());
         }
     });

    ChannelFuture f = b.bind(8080).sync();
    f.channel().closeFuture().sync();
} finally {
    bossGroup.shutdownGracefully();
    workerGroup.shutdownGracefully();
}
```

### 业务 Handler——只关心业务

```java
public class EchoServerHandler extends ChannelInboundHandlerAdapter {

    @Override
    public void channelRead(ChannelHandlerContext ctx, Object msg) {
        String request = (String) msg;          // StringDecoder 已帮你解码了完整的一帧
        ctx.writeAndFlush("Echo: " + request);  // 异步写出
    }

    @Override
    public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
        cause.printStackTrace();
        ctx.close();
    }
}
```

---

## 粘包/拆包——Netty 内置方案

TCP 是字节流协议，没有消息边界。一条消息可能被拆成两个 TCP 包发过来，两个消息可能被塞进一个 TCP 包。Netty 提供了多种解决方案：

```java
// 固定长度 100 字节一帧
pipeline.addLast(new FixedLengthFrameDecoder(100));

// 换行符分隔
pipeline.addLast(new LineBasedFrameDecoder(1024));

// 自定义分隔符（如 \0）
pipeline.addLast(new DelimiterBasedFrameDecoder(1024, Unpooled.wrappedBuffer("\0".getBytes())));

// 报文头长度字段——最常用
pipeline.addLast(new LengthFieldBasedFrameDecoder(
    65535,  // maxFrameLength
    0,      // lengthFieldOffset: 长度字段从报文头第几个字节开始
    4,      // lengthFieldLength: 长度字段占几个字节
    0,      // lengthAdjustment: 长度字段值到实际 body 长度的修正
    4       // initialBytesToStrip: 解码后跳过头部的 4 字节长度字段
));
```

---

## 零拷贝——Netty 的性能优势

"零拷贝"不是真的零拷贝，而是减少 CPU 参与数据搬运的次数。Netty 提供三层：

**CompositeByteBuf**——逻辑组装，不物理拷贝：

```java
ByteBuf header = Unpooled.wrappedBuffer("HTTP/1.1 200\r\n".getBytes());
ByteBuf body   = Unpooled.wrappedBuffer("{\"ok\":true}".getBytes());
CompositeByteBuf composite = Unpooled.compositeBuffer();
composite.addComponents(true, header, body);
ctx.writeAndFlush(composite);  // header 和 body 在内存中仍是独立的，不经过 CPU 合并
```

**FileRegion（底层 sendfile）**——文件直传：

```java
RandomAccessFile raf = new RandomAccessFile("/data/video.mp4", "r");
DefaultFileRegion region = new DefaultFileRegion(raf.getChannel(), 0, raf.length());
ctx.writeAndFlush(region).addListener(f -> raf.close());
// 数据路径: 磁盘 → 内核页缓存 → Socket 发送缓冲区 → 网卡
// 不经过用户空间，不经过 CPU
```

普通文件传输 vs sendfile：

```
普通: 磁盘 → 内核(page cache) → 用户空间 → 内核(socket buf) → 网卡  (4次拷贝)
sendfile: 磁盘 → 内核(page cache) → 网卡                              (DMA直接传)
```

---

## 对比总结

{{< diagram "decision-tree.svg" "I/O 模型选型决策树" >}}

| 维度 | BIO（平台线程） | BIO（虚拟线程） | 原生 NIO | Netty |
|---|---|---|---|---|
| 连接:线程 | 1:1 | M:N | 1:N | Boss+Worker |
| 单连接内存 | ~1MB | ~1KB | 极低 | 极低 |
| 粘包处理 | 自己写 | 自己写 | 自己写 | 内置 10+ 解码器 |
| 零拷贝 | 无 | 无 | 手动 | 三层封装 |
| 线程安全 | 要同步 | 要同步 | 要同步 | 单 Channel 串行 |
| 编程复杂度 | 低 | 低 | 高 | 中 |
| 适用场景 | 学习 | 中等并发 I/O 密集 | 学习 | 生产 |

三条经验：

1. **不要在生产环境直接用原生 NIO**——不是你写不好，是坑太多
2. **虚拟线程让 BIO 可以重新考虑，但不取代 Netty**——它解决的是并发模型问题，不是协议处理问题
3. **框架封装替代不了底层理解**——`CLOSE-WAIT` 泄漏靠 `ss` 查，epoll 空轮询靠 `strace` 查，这些 Netty 帮不了你

---

## 本系列其他文章

| 文章 | 主题 | 核心内容 |
|---|---|---|
| [网络通信基础]({{< ref "/posts/netty/network-explanation" >}}) | TCP/IP、Socket | 数据如何在网络中传输 |
| [Socket 详解]({{< ref "/posts/netty/socket-internals" >}}) | 内核对象模型、缓冲区、选项 | Socket 内部如何工作 |
| [I/O 基础理论]({{< ref "/posts/netty/network-io-theory" >}}) | 两阶段模型、同步/异步/阻塞/非阻塞 | 程序如何读写数据 |
| [I/O 模型原理]({{< ref "/posts/netty/network-io-models" >}}) | BIO、epoll、io_uring | 操作系统如何处理 I/O |
| **I/O 编程实战** | 三种模型的完整代码 | 从代码到系统的对照 |