---
date: '2026-11-06'
draft: false
title: 'I/O 模型原理：BIO、epoll 与 io_uring'
categories: ['技术']
tags: ['Netty', 'NIO', 'epoll', 'io_uring', 'IO']
weight: 3
---

上一篇把 I/O 拆成了两阶段——阶段一「等数据」、阶段二「拷数据」，再叠加阻塞/非阻塞、同步/异步两个正交维度。这一篇把这些抽象概念收回来，落到三个具体的模型上看它们怎么跑：BIO 为什么一个连接一个线程、epoll 凭什么一个线程管一万连接、io_uring 又在阶段二上动了什么手脚。更重要的是，这些模型不是纸面概念——BIO 有 `strace` 里看得见的阻塞，epoll 有空轮询的坑，Linux AIO 干脆是个反面教材。看完这一篇，再回头对着 `strace` 的输出，你大概就能判断自己跑的是哪种 I/O，以及它为什么会卡、会空转、会踩坑。

> 前置阅读：[I/O 基础理论]({{< ref "/posts/netty/network-io-theory" >}}) — 建议先理解两阶段模型和同步/异步/阻塞/非阻塞的区别后再读本篇，否则模型之间的差异会难以分辨。

---

## 一、BIO：一线程一连接

{{< diagram "bio-flow.svg" "BIO 阻塞 I/O 模型的调用流程" "md" >}}

BIO 是最直观的模型：**来一个连接，开一个线程**，线程在 `read()` 上死等数据。

```java
ServerSocket server = new ServerSocket(8080);
while (true) {
    Socket client = server.accept();   // 阻塞等连接
    new Thread(() -> {
        byte[] buf = new byte[1024];
        client.getInputStream().read(buf);  // 阻塞等数据
        // 处理...
    }).start();  // 每个连接一个平台线程
}
```

| 阶段一（等数据） | 阶段二（拷数据） | 线程行为 |
|---|---|---|
| 阻塞 | 同步 | 阶段一挂起睡觉；阶段二同步等内核拷完 |

`read()` 会阻塞这件事本身没错——线程睡着了、不烧 CPU。BIO 真正要命的是，**阻塞期间它一直占着一个昂贵的平台线程**：1 个平台线程 ≈ 1MB 栈空间（虚拟内存，按需提交），10000 个连接 = 10000 个线程 = 光栈就预留 ~10GB，还不算内核为每个线程维护的结构。而实际上 99% 的线程都在等数据，啥活也没干。

> **虚拟线程（Java 21）绕过了这个坑**：JDK 21 引入的虚拟线程阻塞时会被「卸载」，不占用宝贵的平台线程，于是「一线程一连接」在阻塞模型下重新变得可行。但注意——这是**线程模型**的解法，不是 **I/O 模型**的解法：底层 I/O 仍然是阻塞 + 同步，只是线程变便宜了。本篇的对比都建立在平台线程的前提上。

### 用 strace 亲眼看看阻塞状态

```bash
strace -p $(pgrep -f BioServer) 2>&1 | head -5
# 你会看到 accept(3, ...) 或 read(4, ...) 长时间不返回
# 例如 accept(3, {sa_family=AF_INET, ...}, ...) = 4，返回新连接的 fd
```

> **那怎么从 strace 判断线程堵在哪？** 看系统调用是否「卡住不返回」。`accept()` 一直不返回，说明在等新连接；`read()` 一直不返回，说明在等数据。BIO 的线程绝大多数时间就停在两者之一上——这正是「一线程一连接」浪费线程资源的直观证据。

---

## 二、NIO/epoll：一个线程管一万连接

{{< diagram "nio-selector.svg" "NIO Selector 多路复用原理" >}}

NIO 的核心思想：**用一个线程监控多个连接，哪个有数据就处理哪个。** 这个「监控」的能力由多路复用系统调用提供，三代系统调用是递进的：

| 系统调用 | 年代 | 机制 | 时间复杂度 |
|---|---|---|---|
| `select()` | 1983 | 传入 fd 集合，内核遍历所有 fd 找出就绪的，返回整个集合让应用再遍历一遍 | O(n) |
| `poll()` | 1997 | 改用 `pollfd` 数组，去掉 select 的 fd 数量上限（1024） | O(n) |
| `epoll()` | 2002 | 内核维护事件表，仅返回就绪的 fd，无需全量遍历 | O(就绪 fd 数)，最坏 O(n) |

> **顺带一提**：epoll 是 Linux 专属，macOS 默认用 kqueue、Windows 用 select/WSAPoll——所以「NIO」在 Linux 上落到 epoll，在其他平台落到各自的实现，不是只有 epoll 一种。

打个比方，把这三者想成查课堂：

- **select**：教导主任拿着花名册，一个一个问全班 5000 个学生「你举手了吗」，被问 5000 次
- **poll**：同上，但换了个无限长的花名册（没有 fd 上限）
- **epoll**：想举手的学生自己走到讲台前，教导主任只需看讲台上站着几个人

> **`epoll` 的 O(1) 到底是什么的 O(1)？** 严格说，`epoll_wait()` 的开销与**就绪的 fd 数量**成正比，与**注册的 fd 总数**无关。select/poll 每次都要扫一遍全部 fd（哪怕只有 1 个就绪也要扫 10000 个），epoll 只返回真正就绪的那几个。**所以「O(1)」不是永远常数——当全部 n 个 fd 同时就绪时，`epoll_wait()` 要交付 n 个事件，同样退化为 O(n)。** epoll 的优势只在「大多数连接空闲」的稀疏场景成立，而这恰恰是真实服务器的常态。

### Java 里的三个抽象：Channel、Selector、SelectionKey

上面讲的是系统调用，落到 Java 代码里是三个对象在配合：

| 对象 | 是什么 | 分工 |
|---|---|---|
| `Channel` | 一条连接的抽象（内部包着一个 fd） | 连接本体 |
| `Selector` | 多路复用器 | 一个线程通过它同时盯多个 Channel |
| `SelectionKey` | Channel 注册到 Selector 拿到的「凭证」 | 记录「关心什么事件、哪些已就绪」 |

```java
ServerSocketChannel server = ServerSocketChannel.open();
server.configureBlocking(false);
Selector selector = Selector.open();
server.register(selector, SelectionKey.OP_ACCEPT);  // 关心「新连接」

while (true) {
    int ready = selector.select();          // 阻塞等，返回就绪 Channel 数
    for (SelectionKey key : selector.selectedKeys()) {
        Channel ch = key.channel();         // 就绪的 Channel
        // key.isReadable() / isWritable() 判断具体哪个事件就绪
    }
    selector.selectedKeys().clear();        // 处理完必须清空，否则已就绪的 key 会一直留在集合里被重复处理
}
```

一个 Channel 可以同时挂多个事件——事件是位掩码，用 `|` 组合：

| 事件常量 | 含义 | 谁用 |
|---|---|---|
| `OP_READ` | 可读（有数据了） | SocketChannel |
| `OP_WRITE` | 可写（发送缓冲区有空间） | SocketChannel |
| `OP_CONNECT` | 连接已完成 | SocketChannel（客户端） |
| `OP_ACCEPT` | 有新连接 | ServerSocketChannel |

```java
channel.register(selector, SelectionKey.OP_READ | SelectionKey.OP_WRITE);
```

注册时声明的是 `interestOps`（兴趣集），`select()` 返回后读 `key.readyOps()`（就绪集）判断到底哪个事件就绪了。**一个常见坑：`OP_WRITE` 几乎永远「就绪」**（发送缓冲区绝大多数时候有空位），所以平时别注册它——只有写不进去时才临时注册，写完就取消，否则 `select()` 会疯狂空转。

### epoll 靠什么「知道」谁就绪

select/poll 是「主动去问」：每次调用内核遍历所有 fd 逐个检查。epoll 反过来「等 fd 自己报告」，靠三个内核结构：

| 结构 | 作用 |
|---|---|
| 红黑树 | 登记所有被监听的 fd（`epoll_ctl` 增删改） |
| 就绪链表 | 只放「已经就绪」的 fd |
| 回调 `ep_poll_callback` | 挂在每个 fd 的等待队列上 |

注册时（`epoll_ctl`）内核除了把 fd 存进红黑树，还往这个 fd 的等待队列里挂一个回调。数据到达后，整条链路的推进过程：

1. 数据到达，进入 socket 的接收队列 `sk_receive_queue`
2. socket 的等待队列被唤醒，执行回调 `ep_poll_callback`
3. fd 被挂进就绪链表
4. `epoll_wait` 被唤醒，返回「哪个 fd 可读」

`epoll_wait()` 只做一件事：看就绪链表空不空，非空就把就绪事件拷给应用，空就睡觉等回调叫醒。

**epoll 只拷「事件通知」，不拷数据。** 就绪链表里装的是「fd 5 可读了」这种提醒，不是数据本身；真正的数据躺在 socket 的接收队列 `sk_receive_queue` 里，要应用再调一次 `read()` 才能拷到用户态。所以 epoll 必须两步走（`epoll_wait` + `read`），而 io_uring 能把后一步也交给内核异步做。

> **socket 里的「队列」别混**：接收队列、发送队列存的是**数据**；等待队列存的是**谁在等**（epoll 的回调就挂在它上面）；监听 socket 额外有半连接队列（握手未完成）和全连接队列（握手完成、等 `accept()` 领走）。

### 完整链路：从连接建立到读完数据

把上面串起来，一个客户端从连进来到读完第一条消息：

1. 客户端三次握手 → 内核自动完成，连接进「全连接队列」，监听 socket 可读
2. epoll 通知：`select()` 返回，监听 Channel 的 `OP_ACCEPT` 就绪
3. 应用 `accept()` 领走连接，得到新的 SocketChannel，再注册 `OP_READ`
4. 客户端发数据 → 数据进该连接的接收队列 → epoll 回调 → 就绪链表
5. `select()` 返回，SocketChannel 的 `OP_READ` 就绪
6. 应用 `read(buf)` 把数据从接收队列拷到用户态

注意：三次握手在第 1 步就由内核完成了，`accept()` 只是从全连接队列「领走」一个已完成握手的连接（`accept()` 本身也是系统调用，但每个连接只在建连时走一次）。建连完成后，每读一条数据只需 `select()` 和 `read()` 两次系统调用（`select()` 在 Linux 上底层就是 `epoll_wait()`）。

**C10K 问题（1999 年提出）的核心答案就是 epoll**——select/poll 在 10000+ 连接下性能急剧下降，因为每次都要遍历全部 10000 个 fd。epoll 只关注活跃的 fd，在大多数连接空闲的场景下效率极高。

### epoll 的坑——空轮询 bug

epoll 也不是完美的。Linux 下 Java NIO 的 `Selector` 在特定内核版本（2.6.x 早期）存在 epoll 空轮询 bug：`Selector.select()`（底层调用 `epoll_wait`）被虚假唤醒，未阻塞就返回 0 个就绪 Channel，导致应用在事件循环里空转、CPU 飙到 100%。

JDK 的修复方式：内部计数器统计空轮询次数，超过阈值（默认 512 次）就重建 Selector。Netty 也实现了同样的重建逻辑，阈值可配置（`SELECTOR_AUTO_REBUILD_THRESHOLD`，默认同样是 512）。

> **这个坑如今只属于历史**：根因是 Linux 2.6.x 早期的内核 bug，现代内核早已修复；JDK 和 Netty 的重建逻辑保留至今，更多是作为兜底防御，而非应对一个仍然存在的问题。

```bash
# 观察 epoll 空轮询
strace -e epoll_wait -p $(pgrep -f NioServer)
# 如果 epoll_wait 频繁返回 0 且耗时 < 1ms → 遇到了空轮询
```

---

## 三、io_uring：Linux I/O 的未来

{{< diagram "io-uring.svg" "io_uring 共享环形缓冲区架构" "md" >}}

io_uring（2019 年合入 Linux 5.1，近年成熟）是真正意义上的**异步非阻塞**——连阶段二的拷贝也由内核在后台异步完成，调用线程不用等。它通过两个共享内存环形队列实现：

| 队列 | 方向 | 作用 |
|---|---|---|
| Submission Queue（SQ） | 用户 → 内核 | 程序把 I/O 请求写进 SQ（纯用户态写入，提交靠 `io_uring_enter()` 或 SQPOLL 轮询） |
| Completion Queue（CQ） | 内核 → 用户 | 内核完成后把结果放进 CQ，程序来取 |

### epoll vs io_uring——核心差异在阶段二

| 维度 | epoll | io_uring |
|---|---|---|
| 阶段一（等数据） | 非阻塞：`epoll_wait()` 通知有数据了 | 非阻塞：内核后台等 |
| 阶段二（拷数据） | **同步**：线程自己调 `read()`，等内核拷完才返回 | **异步**：内核后台完成拷贝，调用线程立即返回 |
| 系统调用次数 | 至少 2 次（epoll_wait + read） | 可批量提交，一次搞定 |
| 适用场景 | 高并发连接、事件驱动 | 高吞吐、大文件、低延迟 |

> **为什么 io_uring 能「一次搞定」？** epoll 是「先问谁就绪，再亲自去读」两步走；io_uring 把请求直接塞进 SQ 队列，内核完成后往 CQ 写结果，用户态批量提交、批量收割，省掉了频繁进出内核态的开销。这也是它被叫做「未来」的原因。

### 完整流程与两个关键细节

提交到完成的链路：

1. 应用在用户态把请求（SQE）写进 SQ，前移 tail 指针
2. 调 `io_uring_enter()` 通知内核（或开 SQPOLL 让内核线程自己轮询 SQ，连这一步都省了）
3. 内核从 SQ 取请求执行；**数据没就绪时不阻塞**——把请求「挂起」并复用等待队列回调，数据到了再完成，线程早已返回
4. 完成后内核把结果（CQE）写进 CQ，前移 tail 指针
5. 应用从 CQ 读结果

两个容易误解的点：

- **数据没到不会阻塞线程**：内核不是停下来等，而是「挂起请求 + 回调完成」——复用的还是 epoll 那套等待队列机制，只是从「通知就绪」升级成了「完成 I/O」。
- **结果默认要轮询，不是内核主动通知**：内核只把 CQE 写进 CQ，应用要主动检查 CQ 的 tail 是否前进；要被动等就注册 eventfd，内核有完成时写 eventfd，应用再用 epoll 等它被唤醒。

> **既然 io_uring 是「未来」，为什么 Netty 到现在还停在 epoll？** io_uring 的优势在磁盘 I/O、大吞吐上最直接；对网络 Socket 这种「连接多、单条数据小」的场景，epoll 的事件驱动已经够用，io_uring 换来的收益没那么明显。再加上 Netty 整个生态（Channel、Pipeline、Handler）都建立在 epoll 事件循环上，迁移成本高、收益却不突出，所以短期内没有大规模切过去的必要。

---

## 四、Linux AIO——为什么它失败了

{{< diagram "aio-sequence.svg" "POSIX AIO 异步 I/O 时序图" >}}

在 io_uring 之前，Linux 也尝试过异步 I/O，但始终没有真正通用，两个方案各有硬伤：

1. **POSIX AIO（`aio_read`/`aio_write`）**：由 glibc 在**用户态**用线程池模拟——每个 `aio_read` 背后其实是一个阻塞读线程，并非内核级异步
2. **内核原生 AIO（`io_submit`/`io_getevents`）**：只支持 `O_DIRECT` 打开的文件，不能用于普通文件或 Socket

而且两者接口都复杂，与 Java 的生态割裂。

io_uring 的出现，才让 Linux 真正有了通用的内核级异步 I/O——文件、Socket、管道都能用。

---

## 五、Netty 的线程模型

{{< diagram "netty-arch.svg" "Netty Boss/Worker 线程模型架构" >}}

Netty 把上面讲的 NIO 封装成两层 EventLoopGroup——在 Linux 上，Worker 的每个 EventLoop 就是一个线程 + 一个 Selector，跑的还是第二节那套「`select()` 等就绪 → 逐个处理 Channel」的事件循环。它没有发明新的 I/O 模型，只是把这套东西封装得更顺手：

| 组件 | 典型线程数 | 职责 |
|---|---|---|
| Boss EventLoopGroup | 1 | 只做 `accept()`，接收到新连接后扔给 Worker |
| Worker EventLoopGroup | CPU 核数 × 2 | 处理读、写、编解码、业务逻辑 |

它最关键的保证是：**一个 Channel 从生到死绑定在同一个 EventLoop 线程上**——这意味着你的 Handler 不需要加锁，天然线程安全。

```java
public class MyHandler extends ChannelInboundHandlerAdapter {
    // 不需要 synchronized
    // Netty 保证同一个 Channel 的所有事件（channelRead、channelActive 等）
    // 都在同一个 EventLoop 线程中执行
    public void channelRead(ChannelHandlerContext ctx, Object msg) {
        // 线程安全——不需要任何同步
    }
}
```

---

## 六、总结

绕了一圈，三个模型其实都在回答同一件事：**怎么让「等数据」和「拷数据」别白白占着线程。** 把它们放回两阶段框架，一眼就能对齐：

| 模型 | 阶段一（等数据） | 阶段二（拷数据） | 线程 | 读数据的系统调用 |
|---|---|---|---|---|
| BIO | 阻塞 | 同步 | 一线程一连接 | `read()` 1 次 |
| NIO/epoll | 非阻塞（`epoll_wait()` 通知） | 同步 | 一线程管 N 连接 | `epoll_wait()` + `read()` 2 次 |
| io_uring | 非阻塞（内核后台等） | 异步（内核后台拷） | 一线程批量提交 N 个请求 | 批量提交，可 1 次搞定 |

脉络很清晰：BIO 在阶段一就占死线程，epoll 让阶段一不再占线程、但阶段二还得线程亲自去拷，io_uring 连阶段二也交了出去。而 Linux AIO 之所以「失败」，就是卡在这里——POSIX AIO 是用户态线程池的障眼法，内核原生 AIO 又限死在 `O_DIRECT`，既没做到通用，也没覆盖 Socket。

选型上也没那么玄：连接数几千上万、大部分时间空闲，epoll 就是正解；要的是磁盘高吞吐、低延迟、大文件，再看 io_uring。工具没有绝对的好坏，只有贴不贴你的场景——就像开头说的，拿 `strace` 一看，谁停在 `accept`、谁在 `epoll_wait`、谁在 `io_uring_enter`，你跑的是哪种 I/O 就一目了然了。

---

## 术语与延伸

| 概念 | 说明 | 推荐阅读 |
|---|---|---|
| select / poll / epoll | 三代多路复用系统调用，核心差异在「遍历全部 fd」还是「只返回就绪 fd」 | [man7: `epoll(7)`](https://man7.org/linux/man-pages/man7/epoll.7.html) |
| C10K 问题 | 1999 年 Dan Kegel 提出的「单机扛一万并发连接」难题，epoll 是答案 | [The C10K problem](http://www.kegel.com/c10k.html) |
| epoll 空轮询 bug | Linux 2.6.x 早期内核下 `Selector.select()`（底层 `epoll_wait`）虚假唤醒导致 CPU 100%，通过重建 Selector 规避 | [Netty 源码：`NioEventLoop`](https://netty.io/) |
| io_uring（SQ/CQ） | 共享内存环形队列实现的内核级异步 I/O | [Lord of the io_uring](https://unixism.net/loti/) |
| POSIX AIO | glibc 用用户态线程池模拟的「假异步」；内核原生 AIO（`io_submit`）则仅支持 `O_DIRECT` | [man7: `aio(7)`](https://man7.org/linux/man-pages/man7/aio.7.html) |
| Netty Boss/Worker | 两层 EventLoopGroup，一个 Channel 绑定一个 EventLoop 线程 | [Netty 官方文档](https://netty.io/wiki/) |

---

## 参考

- [Linux Programmer's Manual: `epoll(7)`](https://man7.org/linux/man-pages/man7/epoll.7.html)，epoll 多路复用的官方手册页，事件表、就绪列表的权威定义
- [Linux Programmer's Manual: `select(2)`](https://man7.org/linux/man-pages/man2/select.2.html)，select/poll 多路复用的手册页，理解 O(n) 遍历的根源
- [Dan Kegel — The C10K problem](http://www.kegel.com/c10k.html)，万级并发连接问题的原始文章
- [Lord of the io_uring](https://unixism.net/loti/)，io_uring 的入门到实战教程
- [Netty 官方文档](https://netty.io/wiki/)，Boss/Worker 线程模型与 EventLoop 的权威说明