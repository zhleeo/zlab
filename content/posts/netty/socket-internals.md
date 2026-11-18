---
date: '2026-11-17'
draft: false
title: 'Socket 详解：内核对象、缓冲区与选项'
categories: ['技术']
tags: ['Netty', 'Socket', 'TCP', '网络编程']
weight: 2
---

上一篇讲的是网络的"外部"——数据怎么分层封装、连接怎么握手挥手、服务端队列怎么排队。这一篇转到 Socket 这个"内部"对象上：它到底是什么、进程凭什么用一个整数操作它、它的缓冲区怎么工作、有哪些选项值得配置。这些是后面学 I/O 模型时反复要用到的地基。

> 前置阅读：[网络通信基础]({{< ref "/posts/netty/network-explanation" >}}) — 建议先了解 TCP/IP 分层、监听/连接 Socket 和 TCP 状态后再读本篇，否则部分概念缺少上下文。

---

## 一、Socket 是什么：一个被当成文件的连接

Socket 是内核提供的一个抽象对象，进程用一个整数文件描述符（fd）引用它。这个整数本身没有任何网络含义——它只是进程 fd 表里的一个下标，真正的网络状态全在内核里。

关键在"Socket 被实现成了一种文件"。所以 read/write/close 这些面向文件的系统调用可以直接作用于它，epoll 能监听它，也是因为它在内核里和普通文件共用同一套 file 抽象。这条引用链是：

| 层次 | 结构 | 职责 |
|---|---|---|
| 进程 | fd=7 | 只是进程 fd 表里的下标，无网络含义 |
| 通用文件 | struct file | read/write/poll 的统一入口 |
| Socket 通用层 | struct socket | 协议族、类型、操作函数表 |
| 协议实现层 | struct sock | TCP 对应 tcp_sock：缓冲区、状态机、拥塞控制 |

从上到下抽象越来越具体：struct socket 面向"所有 Socket"，struct sock 面向"某一种协议"。

"Socket 是文件"不是一句口号，它带来三个实际后果：

| 后果 | 说明 |
|---|---|
| 统一接口 | 一个 fd 既能读文件也能收发网络数据，应用代码不用区分数据来源 |
| 可被多路复用 | epoll/select/poll 监听的是 file 结构，所以 Socket、pipe、终端等都能统一监听（普通磁盘文件除外，epoll 对它会直接返回 EPERM） |
| 可跨进程传递 | fork 时子进程继承 fd；sendmsg 的 SCM_RIGHTS 能把 fd 传给另一个进程 |

## 二、Socket 的三要素：协议族、类型、协议

创建 Socket 的三个参数决定了它的基本行为，`socket(协议族, 类型, 协议)`：

```c
int fd = socket(AF_INET, SOCK_STREAM, 0);  // IPv4 + 字节流 → 内核自动匹配 TCP
```

- **协议族（domain）**：在哪一层网络里通信、地址是什么形态。
- **类型（type）**：怎么传数据——字节流、数据报，还是原始包。
- **协议（protocol）**：通常填 0，让内核按类型自动匹配（STREAM→TCP，DGRAM→UDP）。

**协议族**决定寻址方式：

| 协议族 | 含义 | 用途 |
|---|---|---|
| AF_INET | IPv4 | 最常用 |
| AF_INET6 | IPv6 | 下一代地址空间 |
| AF_UNIX | 本机进程间通信 | 不走网络栈，延迟最低 |

**类型**里最容易混的是 SOCK_STREAM 和 SOCK_DGRAM——一个是字节流、一个是数据报，差别核心在"有没有消息边界"：

| | SOCK_STREAM（TCP） | SOCK_DGRAM（UDP） |
|---|---|---|
| 抽象 | 字节流，像一条水管 | 数据报，像一封封信 |
| 消息边界 | 无，会粘包/半包 | 有，每次 recv 收到一个完整包 |
| 可靠性 | 可靠（重传 + 确认） | 不可靠（可能丢、可能乱序） |
| 顺序 | 严格有序 | 不保证 |
| 是否需要连接 | 是（先握手） | 否 |

第三种类型 SOCK_RAW 绕过传输层，直接构造 IP 层及以上的报文——ping 用的 ICMP 就靠它，需要 CAP_NET_RAW 能力（root 默认具备）。而 tcpdump 这类抓包工具用的是更底层的 AF_PACKET 链路层套接字，不是这里说的 SOCK_RAW。

## 三、内核里的两个缓冲区

每个 Socket 在内核里都有一收一发两个缓冲区，这是理解"write 成功了对方为什么还没收到"和"粘包"的关键。

```
发送：write("hello") → 发送缓冲区（SO_SNDBUF）→ 内核按窗口 + 拥塞控制发包 → 网卡 → 网络
接收：网络 → 网卡 → 内核协议栈校验、排序 → 接收缓冲区（SO_RCVBUF）→ read(buf)
```

**发送方向**：write() 成功只代表数据进了发送缓冲区，**不代表对方收到了**。真正把数据发出去的是内核——它按滑动窗口（对方还能收多少）和拥塞控制（网络还能扛多少）决定发多少、发多快。

**接收方向**：网卡收到的数据先由内核协议栈校验、排序，放进接收缓冲区，应用 read() 时再从缓冲区拷贝到用户空间。

缓冲区大小：

- TCP 的收发缓冲由 net.ipv4.tcp_rmem / tcp_wmem 决定，内核会自动调优：接收缓冲在 [min, max] 区间内随流量伸缩，上限通常到数 MB。net.core.rmem_default / wmem_default 是所有套接字的初始默认值，TCP 随后被自动调优接管，因此实际主要作用于 UDP 等非 TCP 套接字。
- 手动用 SO_RCVBUF / SO_SNDBUF 可固定大小，但内核会取设置值的约两倍（为协议栈记账开销预留空间）。

缓冲区的存在直接解释了"粘包 / 半包"：TCP 是字节流，接收缓冲区里只是一串连续的字节，没有任何"消息"边界。应用连续 write 三次 "hello"，对方可能：

- 一次 read 读到 "hellohellohello"（粘包）
- 一次 read 只读到 "hel"（半包）
- 分三次恰好读到三个 "hello"（运气好）

根源是：应用层眼里的"一条消息"在 TCP 层根本不存在。解决办法有定长消息、分隔符、长度前缀三种，后面的编程实战篇会具体展开。

## 四、常用的 Socket 选项

Socket 的行为由一组选项控制，先看总表，再逐个说清楚：

| 选项 | 作用 | 典型场景 |
|---|---|---|
| SO_REUSEADDR | 允许 TIME_WAIT 状态的端口被立即复用 | 服务端重启不报 Address already in use |
| SO_REUSEPORT | 多个 Socket 绑定同一端口，内核按哈希分摊新连接 | 多进程服务负载均衡（如 nginx 多 worker） |
| TCP_NODELAY | 禁用 Nagle 算法，小包立即发送 | 低延迟交互（游戏、SSH、RPC） |
| SO_KEEPALIVE | 空闲时发保活探测，检测对端是否崩溃 | 长连接的存活检测 |
| SO_LINGER | 控制 close() 的行为：优雅关闭还是立即 RST | 决定发送缓冲区的数据是否发完 |
| SO_RCVTIMEO / SO_SNDTIMEO | 阻塞 read/write 的超时时间 | 防止线程被死连接永久挂住 |

**SO_REUSEADDR**。服务端主动关闭后进入 TIME_WAIT，端口默认 60 秒内不能重新绑定（见上一篇四次挥手）。设置 SO_REUSEADDR 后，TIME_WAIT 的端口可以立即被新的监听 Socket 绑定——这是服务端重启时 "Address already in use" 的标准解法。

**SO_REUSEPORT**。它和 SO_REUSEADDR 只差一个词，语义却完全不同：SO_REUSEADDR 解决"TIME_WAIT 端口能不能重新绑定"，SO_REUSEPORT 解决"多个 Socket 能不能同时绑定同一个端口"。开启后，内核按四元组哈希把新连接分摊到各个绑定同一端口的 Socket 上，多进程服务（如 nginx 的多个 worker）靠它做内核级负载均衡。两者不能互相替代。

**TCP_NODELAY**。Nagle 算法默认开启：小包会攒起来，等收到 ACK 或攒满一个 MSS 再发，目的是减少网络上的小包数量。代价是延迟——交互场景下每个小包都要等。TCP_NODELAY 关闭 Nagle，小包立即发送，用更多包换更低延迟。

**SO_KEEPALIVE**。TCP 连接空闲时，内核定时发探测包，对端无响应则判定连接已死。但 Linux 默认空闲 2 小时才开始探测，之后每 75 秒探一次、最多 9 次，太慢，工程上更常用应用层心跳（如 Netty 的 IdleStateHandler）。

**SO_LINGER**。默认 close() 是"优雅关闭"：把发送缓冲区的剩余数据发完，走完四次挥手。设 SO_LINGER 且超时为 0，则 close() 立即发 RST、丢弃缓冲区数据、跳过四次挥手——对端会收到 connection reset。

**SO_RCVTIMEO / SO_SNDTIMEO**。阻塞 read/write 时，超过设定时间仍无数据可读或写不出去，就返回超时错误，避免一条死连接把线程永久挂住。

## 五、一个线程凭什么管一万个 Socket

前面铺垫了 Socket 是文件、数据要经过两个缓冲区，现在回到一个自然会问的问题：为什么一个 epoll 线程能同时管理成千上万个连接？答案就藏在本篇第一节——**因为 Socket 是文件**。

阻塞的根源不是"这个 fd 是 Socket"，而是"这个 fd 上的数据还没就绪"。epoll 做的事不是让单个 Socket 更快，而是让线程不再傻等某一个 Socket，转而去等"任意一个 Socket 就绪"——它监听的是一批 file 结构，Socket 只是其中一种。

所以学 I/O 模型之前，先记住两件事：**Socket 是文件**（所以 fd 是统一句柄）、**数据要经过两个内核缓冲区**（所以 I/O 天然分成"等数据"和"拷数据"两个阶段）。下一篇就从这两件事出发，拆开 I/O 的两阶段模型。

---

## 命令速查（Linux）

| 目的 | 命令 |
|---|---|
| 查看连接的收发缓冲区占用 | `ss -tmn`（skmem 字段的 rb / tb 即收发缓冲） |
| 查看套接字初始缓冲默认值 | `sysctl net.core.rmem_default net.core.wmem_default` |
| 查看 TCP 缓冲区自动调优范围 | `sysctl net.ipv4.tcp_rmem net.ipv4.tcp_wmem` |
| 统计 TIME_WAIT 连接数 | `ss -tan state time-wait \| wc -l` |
| 查看保活探测参数 | `sysctl net.ipv4.tcp_keepalive_time net.ipv4.tcp_keepalive_intvl net.ipv4.tcp_keepalive_probes` |

> 以上命令基于 Linux（`ss` 属于 iproute2 工具集）。macOS 没有 `ss`，可用 `netstat` 替代，`sysctl` 的参数名也不同（如 `net.inet.tcp.*`）。

---

## 术语与延伸

| 概念 | 说明 | 推荐阅读 |
|---|---|---|
| 文件描述符（fd） | 进程级句柄，本质是 fd 表下标，数量受 `ulimit -n` 限制 | [man7: `open(2)`](https://man7.org/linux/man-pages/man2/open.2.html) |
| struct file / socket / sock | 内核套接字的三层抽象：通用文件 → 通用 Socket → 协议实现（连同进程 fd 下标，构成正文的四层引用链） | 《深入理解 Linux 内核》 |
| Nagle 算法 | 小包合并以减少网络开销，TCP_NODELAY 关闭它 | [RFC 896](https://www.rfc-editor.org/rfc/rfc896.html) |
| TIME_WAIT / 2MSL | 主动关闭方停留约 60 秒，SO_REUSEADDR 解决端口复用 | [RFC 9293 §3.3.2](https://www.rfc-editor.org/rfc/rfc9293.html) |
| SO_REUSEADDR vs SO_REUSEPORT | 前者 TIME_WAIT 复用，后者多 Socket 同端口分摊 | [man7: `socket(7)`](https://man7.org/linux/man-pages/man7/socket.7.html) |
| CAP_NET_RAW | 原始套接字所需 capability | [man7: `capabilities(7)`](https://man7.org/linux/man-pages/man7/capabilities.7.html) |
| AF_PACKET | 链路层套接字，tcpdump 抓包使用 | [man7: `packet(7)`](https://man7.org/linux/man-pages/man7/packet.7.html) |

---

## 参考

- [Linux Programmer's Manual: `socket(7)`](https://man7.org/linux/man-pages/man7/socket.7.html)，SO_REUSEADDR / SO_REUSEPORT / SO_LINGER 等选项的权威定义
- [Linux Programmer's Manual: `tcp(7)`](https://man7.org/linux/man-pages/man7/tcp.7.html)，TCP_NODELAY 及 TCP 缓冲区自动调优的权威说明
- [Linux Programmer's Manual: `socket(2)`](https://man7.org/linux/man-pages/man2/socket.2.html)，socket() 三个参数（协议族 / 类型 / 协议）的定义
- [RFC 896 — Congestion Control in IP/TCP Internetworks](https://www.rfc-editor.org/rfc/rfc896.html)，Nagle 算法的原始出处
- [Richard Stevens — 《UNIX Network Programming》Vol 1](https://www.amazon.com/Unix-Network-Programming-Sockets-Networking/dp/0131411551)，Socket 编程的经典参考书