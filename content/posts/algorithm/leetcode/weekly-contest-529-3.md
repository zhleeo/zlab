---
date: '2026-11-22'
draft: false
title: '单周赛 529-3. 信号激活的最早时刻'
categories: ['算法']
tags: ['LeetCode', '堆', '图']
---

## 题目信息

<table width="100%" style="display:table"><colgroup><col width="70"><col></colgroup><tbody>
<tr><td>🔗 链接</td><td><a href="https://leetcode.cn/problems/earliest-signal-activation-times/description/">LeetCode 单周赛 529-3</a></td></tr>
<tr><td>🏷 难度</td><td><strong>中等</strong></td></tr>
<tr><td>📌 标签</td><td>堆 · 图</td></tr>
</tbody></table>

---

## 题目描述

给定一个 `n` 个节点的有向图（编号 `0` ~ `n-1`）。`edges[i] = [ui, vi, delayi]` 表示从 `ui` 指向 `vi` 的边，信号沿它传播需 `delayi` 个时间单位。

节点 `0` 在时刻 `0` 激活，其余初始未激活。节点在时刻 `t` 激活时，会**立即**沿每条出边各发一个信号（之后不再发），信号沿延迟为 `d` 的边在 `t + d` 到达。`requiredSignals[i]` 表示节点 `i` 激活前必须从**至少 requiredSignals[i] 个不同入邻居**收到信号，它会在收到这些信号的最早时刻激活。

返回 `ans`，其中 `ans[i]` 是节点 `i` 的最早激活时刻，永远无法激活则为 `-1`。`requiredSignals[0]` 的值不影响结果（节点 `0` 在时刻 `0` 已激活）。

> 数据范围：`2 ≤ n ≤ 10⁵`，`0 ≤ edges.length ≤ 10⁵`，`1 ≤ delayi ≤ 10⁹`，任意两节点间至多一条有向边，`1 ≤ requiredSignals[i] ≤ n - 1`。
> 时刻上界：最坏情况下信号沿 `n - 1` 条边的链传播，最晚可达 `(n - 1) × 10⁹ ≈ 10¹⁴`，超出 `int`，故 `ans` 用 `long[]`。

---

## 思路分析

### 1. 信号天然去重

节点激活后只沿每条出边发**一次**信号，且任意两节点间至多一条边，因此到达节点 `i` 的每个信号都来自**互不相同的入邻居**，无需去重。

### 2. 激活时刻 = 第 k 小到达时刻

把节点 `i` 收到的信号按到达时刻排序，它会在**第 `k = requiredSignals[i]` 个信号**到达时激活——节点等的不是第 1 个信号，而是第 `k` 个。因此激活时刻就是所有到达时刻里的**第 k 小**；若信号不足 `k` 个，则永不激活（`-1`）。

> 这不是 Dijkstra（Dijkstra 只求第 1 小最短路）；仅当所有 `requiredSignals[i] = 1` 时才退化为 Dijkstra。

### 3. 最小堆 + 计数

用按到达时刻排序的**最小堆**维护 `(到达时刻, 目标节点)`：

1. 初始化 `requiredSignals[0] = 1`，堆放入 `(0, 0)`；
2. 弹出堆顶 `(t, c)`，执行 `requiredSignals[c]--`：
   - 减后不为 0：尚未集满，继续等；
   - 减后为 0：`t` 即节点 `c` 的第 `k` 个信号到达时刻（`k` 为原 `requiredSignals[c]`），记录 `ans[c] = t`，并沿每条出边 `(c → v, delay)` 把 `(t + delay, v)` 入堆。

堆按时间从小到大弹出。虽然节点 `c` 的信号会与其他节点的信号交错弹出，但属于 `c` 的信号到达时刻本身是递增的，堆只是按时间把它们按序吐出；因此节点 `c` 第 `k` 次被弹出，对应的正是它第 `k` 小的到达时刻。

### 4. 有环也正确

未激活的节点不会传播；已激活节点计数继续减为负数、永不回 0，不会重复发信号。因此环（如 `0 → 1 → 0`）不影响正确性。

### 5. 举例走查

以 `n = 4`、`edges = [[0,1,2],[0,2,1],[1,2,3],[2,3,1]]`、`requiredSignals = [1,1,2,1]` 为例（节点 `2` 需 2 个信号）：

| 弹出 (t, c) | requiredSignals[c] 变化 | 是否激活 | 入堆 |
|---|---|---|---|
| (0, 0) | 1 → 0 | ✅ 激活于 0 | (2, 1)、(1, 2) |
| (1, 2) | 2 → 1 | ❌ 继续等 | — |
| (2, 1) | 1 → 0 | ✅ 激活于 2 | (5, 2) |
| (5, 2) | 1 → 0 | ✅ 激活于 5 | (6, 3) |
| (6, 3) | 1 → 0 | ✅ 激活于 6 | — |

结果 `ans = [0, 2, 5, 6]`。注意节点 `2`：它收到的两个信号分别在 `t = 1`（来自 0）和 `t = 5`（来自 1）到达，因为需要 2 个信号，所以激活时刻是**第 2 小**的到达时刻 `5`，而非第 1 小 `1`——正印证了第 2 节的结论。

---

## 代码实现

```java
class Solution {
    public long[] earliestActivationTimes(int n, int[][] edges, int[] requiredSignals) {
        // 邻接表：g[u] 存 (v, delay)
        List<int[]>[] g = new ArrayList[n];
        Arrays.setAll(g, a -> new ArrayList<>());
        for (int[] e : edges) {
            g[e[0]].add(new int[]{e[1], e[2]});
        }

        long[] ans = new long[n];
        Arrays.fill(ans, -1);

        // requiredSignals[0] 不影响结果，置 1 使节点 0 在时刻 0 激活
        requiredSignals[0] = 1;
        // 最小堆：(到达时刻, 目标节点)
        PriorityQueue<long[]> q = new PriorityQueue<>(Comparator.comparingLong(a -> a[0]));
        q.add(new long[]{0, 0});

        while (!q.isEmpty()) {
            long[] cur = q.poll();
            long t = cur[0];
            int c = (int) cur[1];

            requiredSignals[c]--;
            if (requiredSignals[c] != 0) continue; // 信号未集满，继续等待

            ans[c] = t; // 信号集满，节点在时刻 t 激活
            for (int[] next : g[c]) {
                q.add(new long[]{t + next[1], next[0]});
            }
        }

        return ans;
    }
}
```

---

## 复杂度

<table width="100%" style="display:table"><colgroup><col width="70"><col></colgroup><tbody>
<tr><td>⏱ 时间</td><td>O((n + m) log m)</td></tr>
<tr><td>📦 空间</td><td>O(n + m)</td></tr>
</tbody></table>

> 每条边至多入堆一次（其源节点至多激活一次），加上初始的节点 `0`，堆中元素数不超过 `m + 1`，其中 `m = edges.length`。