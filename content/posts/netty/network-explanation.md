---
date: '2026-11-06'
draft: false
title: '网络通信基础：从数据包到 Socket'
categories: ['技术']
tags: ['Netty', 'TCP/IP', '网络协议', 'Socket']
weight: 1
---

一次网络请求背后，数据要先逐层封装、再和对方建立连接、然后在服务端的队列里排队、最后被某个进程读走。这一篇按顺序拆开这四件事：数据怎么打包、连接怎么建立、连接怎么排队、连接怎么关闭。后面几篇讲 I/O 模型时，会反复回到这里的几个结论。

## 一、分层与封装

网络要同时解决四个彼此独立的问题：应用怎么收发数据、数据丢了怎么办、跨网络怎么找到对方主机、同一链路内帧怎么传输。分层把它们切开，每层只解决自己的那个问题：向上层提供服务，同时使用下层提供的服务，不关心下层具体怎么实现。

{{< diagram "osi-tcpip.svg" "OSI 七层模型与 TCP/IP 四层模型的对应关系" >}}

看左边七层怎么合并成右边四层：应用层对上三层的合并是关键。

| 层级 | 解决什么问题 | 数据单元 | 代表协议 |
|---|---|---|---|
| 应用层 | 业务语义 | 消息 | HTTP、DNS、SSH |
| 传输层 | 进程到进程的传输，可靠或不可靠 | 段 / 数据报 | TCP、UDP、QUIC |
| 网络层 | 主机到主机的跨网络寻址与路由 | 包 | IP、ICMP |
| 网络接口层 | 同一链路内的帧传输 | 帧 | Ethernet、Wi-Fi、ARP |

OSI 七层是 ISO 先定的理论模型，TCP/IP 是先有实现再倒推出来的。两者层数不同，但职责划分一致。

发送时逐层加头，接收时逐层剥头：

{{< diagram "packet-encap.svg" "数据在 TCP/IP 各层的封装与解封装" >}}

以浏览器请求 `example.com` 首页为例，数据在四层之间逐级包裹，每往下一层就多套一层头：

```
应用层 —— 原始数据（对传输层透明）
  GET / HTTP/1.1
  Host: example.com
  （约 50 字节的 HTTP 请求文本）

↓ TCP 加头

传输层 —— TCP 段
┌──────────────────────────────────────┐
│ src_port=54321  dst_port=80          │  ← TCP 头（20 字节）
│ seq=1001  ack=1  flags=PSH+ACK ...  │
├──────────────────────────────────────┤
│ GET / HTTP/1.1\r\nHost: example...  │  ← 上层数据在这里只是 payload
└──────────────────────────────────────┘

↓ IP 加头

网络层 —— IP 包
┌──────────────────────────────────────┐
│ src=192.168.1.5  dst=93.184.216.34  │  ← IP 头（20 字节）
│ protocol=TCP  ttl=64  ...           │
├──────────────────────────────────────┤
│ [ 整个 TCP 段原封不动放在这里 ]       │
└──────────────────────────────────────┘

↓ 以太网加头 + 加尾

网络接口层 —— 以太网帧
┌──────────────────────────────────────┐
│ dst_mac=00:11:22:33:44:55            │  ← 以太网帧头（14 字节）
│ src_mac=aa:bb:cc:dd:ee:ff  type=IPv4│
├──────────────────────────────────────┤
│ [ 整个 IP 包原封不动放在这里 ]        │
├──────────────────────────────────────┤
│ FCS=0xA1B2                           │  ← 帧尾校验（4 字节）
└──────────────────────────────────────┘
```

接收方按相反顺序从外到内逐层剥头：网卡校验 FCS 后剥掉以太网帧头交给 IP 层，IP 层查 `protocol=TCP` 后剥掉 IP 头交给 TCP，TCP 查 `dst_port=80` 后剥掉 TCP 头，把 `GET / HTTP/1.1` 原样交给应用层。

这就是分层的核心价值——**透明性**：路由器看到的是 IP 头，不知道里面是 HTTP 还是 DNS；把以太网换成 Wi-Fi，IP 层以上的代码一行不用改。

## 二、三次握手：为什么必须是三次

{{< diagram "tcp-handshake.svg" "TCP 三次握手，双方交互与序列号交换" >}}

握手要解决的是一个很具体的问题：**怎样让两台机器对"这条连接从哪里开始编号"达成一致**。RFC 793 §3.4 给出的理由是这样一段：

> 三次握手之所以必要，是因为序列号没有绑定到网络中的全局时钟，不同的 TCP 实现可能用不同方式选择初始序列号（ISN）。第一个 SYN 的接收方无法判断这个段是新连接请求还是一个延迟到达的旧段——除非它记得上次连接用过的序列号，而这并不总是可行。因此它必须请发送方来验证这个 SYN。

这段话的关键词是"请发送方验证这个 SYN"——为什么需要验证？根本原因在于 TCP 区分连接归属的手段有两层：

1. **四元组** `(源 IP, 源端口, 目标 IP, 目标端口)`。但四元组会被复用——客户端进程退出后端口被释放，下次很可能用同一个端口连同一台服务器，新旧两条连接的四元组完全相同。仅靠四元组无法区分。
2. **序列号窗口**。TCP 收到报文时会检查序列号是否落在当前连接的接收窗口内，窗口外的一律丢弃。这是区分"当前连接的数据"和"上一条连接残留的数据"的主要手段。

而序列号不依赖时钟同步，双方各自随机挑一个初始值（ISN）。既然没有共同基准，就只能在建连时把自己的 ISN 告诉对方，并等对方确认收到——每个方向各需要一次"告知 + 确认"，三次握手做的正是这件事。

把每一次交互翻译成"谁向谁确认了什么"：

| 报文 | 这一步说了什么 | 状态变化 |
|---|---|---|
| ① `SYN seq=x` | 客户端说：我的 ISN 是 x | 客户端 → `SYN_SENT`，服务端 → `SYN_RECV` |
| ② `SYN+ACK seq=y ack=x+1` | 服务端说：收到 x，我的 ISN 是 y | 客户端 → `ESTABLISHED`，服务端仍 `SYN_RECV` |
| ③ `ACK ack=y+1` | 客户端说：收到 y | 服务端 → `ESTABLISHED` |

**为什么两次不够。** 设想只有前两步：服务端收到 SYN 就回 SYN+ACK，然后立刻分配内存、把连接放进队列，认为连接已建立。如果这个 SYN 其实是上一条连接延迟了几十秒的旧报文，客户端根本没在等它——服务端就凭空多出一条永远不会有人用的连接，只能等超时回收。

第三次 ACK 让服务端拿到"发送方此刻确实在参与这次握手"的证据，再决定是否提交资源。RFC 说的"请发送方验证这个 SYN"正是此意：客户端如果没发起过，收到 SYN+ACK 会直接回 RST，服务端立即清掉这条半开连接；只有发起过，才会回 ACK。

**为什么不是四次。** 两边各需要一次"告知 + 确认"，而服务端的确认（ACK x+1）可以和自己这一侧的告知（SYN y）放在同一个报文里——两个标志位同时置位，不引入新语义。所以三个报文已经覆盖全部信息，第四个报文没有额外要传递的东西。

还有两个容易记错的细节：

- SYN 和 FIN 各自占用一个序列号，所以确认号是 `x+1` 而不是 `x`
- 客户端发出第三个 ACK 后立刻进入 `ESTABLISHED`，不等服务端确认。因此客户端侧建连耗时是 1 个 RTT（服务端要等收到第三个 ACK，约 1.5 RTT），并且第三个 ACK 可以与第一个数据包同时发出

## 三、服务端的两条队列

**这两个队列都在服务端。** 客户端发起连接后没有对应的队列概念——它只维护自己这一条连接，建连成功就直接用，不需要排队等谁来取。

握手由内核完成，`accept()` 只是把已经握完手的连接取走。所以内核必须先把连接排进队列：

{{< diagram "syn-backlog.svg" "SYN 队列与 ACCEPT 队列，以及握手的四个阶段" >}}

| 队列 | 存放什么 | 上限 |
|---|---|---|
| SYN 队列 | 收到 SYN、还没收到第三次 ACK 的请求 | `tcp_max_syn_backlog` |
| ACCEPT 队列 | 握手已完成、还没被 `accept()` 取走 | `min(backlog, somaxconn)` |

两个容易出错的地方：

- `listen(fd, backlog)` 的 backlog 决定 ACCEPT 队列上限，并且会被 `somaxconn` 截断。`somaxconn` 在 Linux 5.4 之前默认 128，之后默认 4096——很多老文章里"明明设了 1024 还是不生效"，就是撞上了旧的默认值。
- SYN 队列另有 `tcp_max_syn_backlog` 控制，且是每个监听端口一份。开启 `tcp_syncookies`（多数发行版默认开启）时，SYN 队列溢出不会直接丢包，而是退化为无状态握手：把连接信息编码进加密 Cookie 随 SYN+ACK 发回，等对方回 ACK 时再还原。

ACCEPT 队列满时的行为由 `net.ipv4.tcp_abort_on_overflow` 决定：

- `0`（默认）：丢弃第三次 ACK。服务端停在 `SYN_RECV`，客户端却已经认为自己连上了。表现是"能建连，但请求一直超时"，服务端日志里什么都看不到
- `1`：直接回 RST，客户端立刻收到 connection reset by peer。利于暴露问题，但会误伤瞬时突发流量

### 用 ss 查看队列状态

以上都是内核内部状态，线上排查时用什么看？`ss -lnt` 是首选：

```bash
ss -lnt sport = :8080
```

对于 LISTEN 状态的 Socket，`ss` 输出的两列含义与 ESTABLISHED 状态不同：

- **Recv-Q**：ACCEPT 队列的当前长度，即三次握手已完成、等待 `accept()` 取走的连接数
- **Send-Q**：ACCEPT 队列的最大长度，即 `listen()` 传入的 backlog 被 `somaxconn` 截断后的实际值

`Recv-Q` 长期贴着 `Send-Q`，说明应用 `accept()` 太慢，新连接在排队等取走，不是网络问题。这类故障最容易误判：`ss` 显示 LISTEN 正常、端口通、防火墙也没拦，但新连接就是上不来。

## 四、四次挥手：一条连接有两个方向

握手三个报文就够，挥手通常却要四个，根源在于 **TCP 是全双工的**：一条连接上有两个方向的数据流，就像一条双向车道，A 方向封了不影响 B 方向继续通车——每个方向都要单独关闭。

{{< diagram "tcp-wave.svg" "TCP 四次挥手，两个方向分别关闭的过程" >}}

先澄清 `FIN` 的准确语义：它**不是**"我要断开连接"，而是"**我这个方向不再发送数据了，但我仍然可以接收对方发来的数据**"。这种"只关一半"的状态叫半关闭（half-close）。

所以关闭一条连接，本质是两次单向关闭的叠加——主动方先关自己的发送方向，被动方随后关自己的发送方向：

| 报文 | 含义 | 主动方状态 | 被动方状态 |
|---|---|---|---|
| ① `FIN seq=u` | 主动方：我这个方向发完了 | `FIN_WAIT_1` | `CLOSE_WAIT` |
| ② `ACK ack=u+1` | 被动方：收到，但我可能还有数据 | `FIN_WAIT_2` | `CLOSE_WAIT` |
| ③ `FIN seq=w` | 被动方：我也发完了 | `FIN_WAIT_2`（收到后 → `TIME_WAIT`） | `LAST_ACK` |
| ④ `ACK ack=w+1` | 主动方：收到你的 FIN | `TIME_WAIT` | `CLOSED` |

**为什么 ② 和 ③ 不能合并。** ② 是"我收到你的 FIN"的即时确认，③ 是"我这边数据也发完了"的独立事件。两者之间隔着长度不确定的数据传输——`CLOSE_WAIT` 期间被动方仍在正常发包。语义不同，不能捎带。

但反过来，**如果被动方确实没有剩余数据要发，② 和 ③ 会合并成一个 `FIN+ACK`**，抓包只看到三个报文。这不叫"三次挥手"，只是两个事件恰好同时发生。

**TIME_WAIT 为什么存在。** 它是四次挥手的最后一个状态，也是线上最容易被误解的状态——看到一堆 `TIME_WAIT` 不等于出了问题。

Linux 把 `TIME_WAIT` 固定为 60 秒（`TCP_TIMEWAIT_LEN`，编译期常量，改不了）。RFC 793 建议 MSL 为 2 分钟、TIME-WAIT 为 2MSL 即 4 分钟，Linux 相当于把 MSL 取成 30 秒。

TIME_WAIT 有两个作用，缺一不可：

1. **保证最后一个 ACK 送达**。④ 若丢失，被动方会重传 ③；主动方必须还在 `TIME_WAIT` 状态，才能再回一个 ACK。如果主动方直接关闭，被动方只能重传到超时后报错关闭——这条连接没有干净地收尾。
2. **让旧连接的报文消亡**。2MSL 大于一个报文在网络中的最大存活时间。等这段时间过去，这条四元组上的所有旧报文都已消失，此时复用同一端口建新连接，不会收到上一个连接的残留数据。

第一条保护的是**这次关闭的完整性**，第二条保护的是**下一次复用同一四元组的连接**不被污染。

## 五、Socket 与故障定位

### 监听 Socket 与连接 Socket

注意一个端口上只挂一个监听 Socket，每个客户端对应一个连接 Socket。

{{< diagram "listen-vs-conn.svg" "监听 Socket 与连接 Socket 的关系" >}}

先看一段服务端的伪代码，重点只有一个：**`accept()` 把监听 fd 吃进去，吐出一个新的 fd**。

```c
int listen_fd = socket(...);          // ① 创建 Socket，假设内核返回 fd=7
bind(listen_fd, &addr, sizeof(addr)); // ② 绑定 0.0.0.0:8080
listen(listen_fd, backlog);           // ③ 开始监听

while (1) {
    int conn_fd = accept(listen_fd, ...); // ④ 阻塞等待。有人连进来后，返回新 fd=11
    read(conn_fd, buf, size);             // ⑤ 读这个客户端发的数据
    write(conn_fd, resp, len);            // ⑥ 回响应
    close(conn_fd);                       // ⑦ 跟这个客户端断开
}
// 注意：read/write/close 全用 conn_fd，listen_fd 全程不碰数据
```

每一行背后是一个实实在在的系统调用。fd=7 和 fd=11 都在服务端进程内部，但角色完全不同：

|        | fd=7（监听 Socket） | fd=11（连接 Socket）  |
|--------|---------------------|-----------------------|
| **来源** | 前 3 步自己创建     | 第 4 步 `accept()` 返回 |
| **数量** | 一个端口只有一个     | 每个客户端一个（12、13……） |
| **能做什么** | 只能传给 `accept()` | `read()` / `write()` / `close()` |
| **绑了多少信息** | 本机 IP + 端口      | 完整四元组：客户端 IP、客户端端口、本机 IP、8080 |

`accept()` 的任务就是**把一条已经完成三次握手的连接，从内核的 ACCEPT 队列里取出来，包装成一个新的 fd 交给进程**。参数是"等客的"监听 fd，返回值是"陪客的"连接 fd。客户端没有这个函数——客户端 `connect()` 之后直接用自己 `socket()` 创建的 fd 通信。

### 完整调用链

看左右两列的函数序列：服务端多出 `bind`、`listen`、`accept` 三个步骤。

{{< diagram "socket-flow.svg" "服务端与客户端从建连到关闭的完整调用流程" >}}

两端各自走不同的函数序列。下面用 `strace` 分别抓取，然后对照时间线解释 `accept()` 内部发生了什么。

**服务端（nc -l 8080）：**

```bash
strace -e trace=socket,bind,listen,accept nc -l 8080
# socket(AF_INET, SOCK_STREAM, IPPROTO_TCP) = 3    监听 Socket（fd=3）
# bind(3, {sin_port=htons(8080), ...})    = 0       绑定端口 8080
# listen(3, 1)                            = 0       开始监听，backlog=1
# accept(3, ...)                          = 4       阻塞等待，返回连接 Socket（fd=4）
```

**客户端（nc localhost 8080）：**

```bash
strace -e trace=socket,connect nc localhost 8080
# socket(AF_INET, SOCK_STREAM, IPPROTO_TCP) = 3    客户端也创建 Socket
# connect(3, {sin_port=htons(8080), ...}) = 0      发起三次握手，阻塞到握手完成
```

客户端没有 `bind()`、`listen()`、`accept()`——它只需要 `socket()` + `connect()`。`connect()` 内部由内核自动分配一个临时端口，无需应用层操心。握手由内核在 `connect()` 内部完成，返回时连接已建立（或失败）。之后这个 fd=3 直接用于 `send()`/`recv()`。

**`accept()` 究竟返回了什么。** 只看 `accept(3, ...) = 4` 确实跳跃，把它拆成四步就清楚了：

| 时刻 | 谁在做什么 | 状态 |
|---|---|---|
| 1 | 服务端调用 `accept(3, ...)`，系统调用进入内核，进程**阻塞** | 监听 fd=3 就绪，等待客户端连接 |
| 2 | 客户端调用 `connect()`，内核与服务端完成三次握手 | 握手结束，两端都进入 `ESTABLISHED` |
| 3 | 服务端内核**创建一个新的 Socket**，并把它的四元组填好（客户端 IP、客户端端口、本机 IP、8080），放入 ACCEPT 队列 | 新 Socket 在内核中等待被取走 |
| 4 | `accept()` 被唤醒，从 ACCEPT 队列取出新 Socket，**分配一个空闲的文件描述符**（假设是 4），作为返回值交还给进程 | `accept()` 返回 4，进程拿到连接 Socket 的 fd |

步骤 3 是理解的关键：**fd=4 不是凭空变出来的，是内核在握手完成后新创建的**。步骤 4 把这个 fd 交给进程，此后 fd=4 就是进程和这个特定客户端通信的句柄。下一次循环再调用 `accept(3, ...)`，又会为下一个客户端返回一个新的 fd。

这也解释了为什么 `accept()` 的参数和返回值指向两种不同的 Socket：**参数是"等客的"，返回值是"陪客的"**。

### 三类高频故障

上面几节讲的是正常流程。线上出问题时，最常见的三类故障恰好对应第三、第四节讨论的机制——ACCEPT 队列、TIME_WAIT、CLOSE_WAIT。下面汇总诊断方向和应对策略：

| 现象 | 原因 | 处理 |
|---|---|---|
| 主动关闭方堆积 `TIME_WAIT` | 短连接太多，每条关闭后残留 60 秒 | 连接池 / 长连接 |
| 被动关闭方堆积 `CLOSE_WAIT` | 代码漏了 `close()` | 只能改代码，调内核参数无效 |
| 能建连但请求超时 | ACCEPT 队列满，第三次 ACK 被丢弃 | 调大 backlog，或让应用更快 `accept()` |

`CLOSE_WAIT` 持续增长就是 fd 泄漏的确定信号——每个 `CLOSE_WAIT` 连接占用一个文件描述符，不释放就会最终耗尽进程的 fd 上限。

处理 `TIME_WAIT` 时有两个常见的过时建议要避开：

- `tcp_tw_recycle` 在 Linux 4.12 已被移除，它在 NAT 环境下会让连接随机失败
- `tcp_tw_reuse=1` 依赖 TCP timestamps，必须两端都开启才生效，且只对客户端（主动连接方）有效

### 命令速查（Linux）

以下命令覆盖从端口检查、队列诊断到抓包分析的全部排查链路，按使用频率排列：

| 目的 | 命令 |
|---|---|
| 端口是否在监听 | `ss -lnt sport = :8080` |
| ACCEPT 队列是否打满 | `ss -lnt sport = :8080`（对比 Recv-Q 与 Send-Q） |
| 某端口的全部连接 | `ss -tn '( sport = :8080 or dport = :8080 )'` |
| 各状态连接数统计 | `ss -tan \| awk 'NR>1{print $1}' \| sort \| uniq -c \| sort -rn` |
| 抓包看握手细节 | `sudo tcpdump -i any -S -c 10 'tcp port 8080'` |
| 追踪网络系统调用 | `strace -f -e trace=network -p <pid>` |

macOS 没有 `ss` 和 `strace`：查看监听与连接用 `lsof -nP -iTCP:8080` 或 `netstat -an | grep 8080`，跟踪系统调用用 `sudo dtruss -f -t network -p <pid>`（需要 root，且部分系统上要关闭 SIP）。

## 术语与延伸

文中涉及但未展开的概念，均可通过以下来源深入学习：

| 概念 | 说明 | 推荐阅读 |
|---|---|---|
| TCP 状态机 | `LISTEN` → `SYN_RECV` → `ESTABLISHED` 等全部 11 种状态及迁移规则 | [RFC 9293 §3.3.2](https://www.rfc-editor.org/rfc/rfc9293.html#name-tcp-state-machine) |
| ISN（初始序列号） | 随机选取的原因及安全考量 | [RFC 6528 §3](https://www.rfc-editor.org/rfc/rfc6528.html#section-3) |
| SYN Cookie | 抵御 SYN flood 攻击的无状态握手机制 | [Linux Kernel — syncookies](https://www.kernel.org/doc/html/latest/networking/ip-sysctl.html#tcp-syncookies)、[Wikipedia](https://en.wikipedia.org/wiki/SYN_cookies) |
| MSL（最大报文生存时间） | 为什么是 2MSL，各操作系统实现的差异 | [RFC 9293 §3.4.2](https://www.rfc-editor.org/rfc/rfc9293.html#name-half-closed-connections) |
| TIME_WAIT 暗杀 | 旧报文干扰 `TIME_WAIT` 连接的极端情况 | [RFC 1337](https://www.rfc-editor.org/rfc/rfc1337.html) |
| `tcp_tw_recycle` 移除 | Linux 4.12 移除的原因（NAT 下导致丢包） | [LWN: tcp_tw_recycle removal](https://lwn.net/Articles/722181/) |
| 文件描述符（fd） | 进程级资源限制 `ulimit -n`，以及耗尽后的表现 | `man 2 open`、`man 3 ulimit` |
| RTT（往返时延） | TCP 建连耗时、重传超时均依赖 RTT 估算 | [RFC 6298](https://www.rfc-editor.org/rfc/rfc6298.html) |
| 全双工 / 半关闭 | TCP 双向独立关闭的设计动机 | [RFC 9293 §2.7](https://www.rfc-editor.org/rfc/rfc9293.html#name-data-communication) |

## 参考

- [RFC 9293 — Transmission Control Protocol (TCP)](https://www.rfc-editor.org/rfc/rfc9293.html)，现行 TCP 标准，已取代 RFC 793
- [RFC 793 — Transmission Control Protocol](https://www.rfc-editor.org/rfc/rfc793.html)，三次握手的原始论证见 §3.4 Establishing a connection
- [Linux IP Sysctl 文档](https://www.kernel.org/doc/html/latest/networking/ip-sysctl.html)，`tcp_max_syn_backlog`、`tcp_abort_on_overflow`、`tcp_tw_reuse` 的官方说明