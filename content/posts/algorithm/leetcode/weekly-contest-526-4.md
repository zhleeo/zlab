---
date: '2026-11-02'
draft: false
title: '单周赛 526-4. 具有偶数异或奇偶性的最小成本路径'
categories: ['算法']
tags: ['LeetCode', '树形DP', 'DFS']
---

## 题目信息

<table width="100%" style="display:table"><colgroup><col width="70"><col></colgroup><tbody>
<tr><td>🔗 链接</td><td><a href="https://leetcode.cn/problems/minimum-cost-path-with-even-xor-parity/description/">LeetCode 单周赛 526-4</a></td></tr>
<tr><td>🏷 难度</td><td><strong>困难</strong></td></tr>
<tr><td>📌 标签</td><td>树形DP · DFS</td></tr>
</tbody></table>

---

## 题目描述

给定一棵 `n` 个节点的树（节点编号 `0` 到 `n-1`），根节点为 `0`。每个节点 `i` 有一个整数值 `values[i]`，每条边 `[u, v, w]` 表示节点 `u` 和 `v` 之间有一条激活成本为 `w` 的边。

你可以选择激活若干条边，使得被激活边构成的连通分量包含节点 `0`。激活的总成本为所有被激活边的成本之和。

设被激活节点集合为 `S`，令 `X = values[i1] ⊕ values[i2] ⊕ ...`（对 `S` 中所有节点的值取异或）。要求 `X` 的二进制表示中 `1` 的个数为**偶数**。

> 求**最小激活总成本**。若不存在合法方案，返回 `-1`。

---

## 思路分析


### 1. 化简点权

异或运算在集合视角下就是对称差。由 `|A Δ B| = |A| + |B| - 2|A ∩ B|`，两边模 2 消去交叉项，得到：

```
p(a xor b) mod 2 = (p(a) + p(b)) mod 2
```

其中 `p(x)` = `x` 的二进制中 `1` 的个数。也就是说：多个数异或后 1 的个数的奇偶性，等于各数 1 的个数奇偶性的异或和。因此每个 `values[x]` 只需压缩为一个比特：

```
pVal[x] = bitCount(values[x]) % 2      // 0=偶, 1=奇
```


### 2. LCA 分解路径

对于树上任意一条路径 `a — b`，设 `x = LCA(a, b)`，则有经典拆解：

<table width="100%" style="display:table"><colgroup><col width="140"><col></colgroup><tbody>
<tr><td><strong>点权异或和</strong></td><td>`(根->a 的 pVal 异或) xor (根->b 的 pVal 异或) xor pVal[x]`<br>（`x` 在两条根路径上各算一次，抵消后补回）</td></tr>
<tr><td><strong>边权和</strong></td><td>`dist(x, a) + dist(x, b)`</td></tr>
</tbody></table>

问题变为：枚举拐点 `x`，在 `x` 的不同子树中选两个后代 `a`、`b`，使得路径 `a—b` 上点权异或和的奇偶性为0，且 `dist(x, a) + dist(x, b)` 最小。这和**树的直径**的枚举拐点做法完全一致。


### 3. 状态定义

DFS 过程中，在节点 `x` 维护：

```
minSum[0] = x 到某后代的最小边权和，且该后代的"根->后代" pVal 异或和为 0（偶）
minSum[1] = x 到某后代的最小边权和，且该后代的"根->后代" pVal 异或和为 1（奇）
```

传入参数 `pOnes` = 根到 `x` 路径上所有 pVal 的异或和。以 `x` 自身作为"后代"的基准情况：

```
minSum[pOnes]     = 0       // x 到自己，边权为 0
minSum[pOnes ^ 1] = INF     // 仅凭 x 自身得不到另一种奇偶性
```


### 4. 状态转移

遍历 `x` 的每个子节点 `y`（边权 `c`）：

**① 递归**：拿回 `y` 的 minSum，加上边 `(x, y)` 的成本后才表示"从 `x` 出发经 `y` 到后代"：

```
mn[0] += c
mn[1] += c
```

**② 拼路径**：将之前子节点中的最优结果（minSum）与当前 `y` 这条（mn）在 `x` 处拼接。

minSum 和 mn 各自对应一条"根->后代"路径，两者共享了根->`x` 这段。将它们的奇偶性异或时，共享部分自动抵消，但 `x` 的 `pVal[x]` 也因此被消掉了——而最终路径包含 `x`，所以必须把 `pVal[x]` 补回来：

```
拼接奇偶性 = minSum奇偶性 xor mn奇偶性 xor pVal[x]
```

要求结果为 0（偶），即 `minSum奇偶性 xor mn奇偶性 = pVal[x]`：

| pVal[x] | 条件 | 拼法 |
|---|---|---|
| 0 | 两条分支**同**奇偶 | `minSum[0] + mn[0]` 或 `minSum[1] + mn[1]` |
| 1 | 两条分支**反**奇偶 | `minSum[0] + mn[1]` 或 `minSum[1] + mn[0]` |

统一为一行：

```java
ans = min(ans, min(minSum[0] + mn[pVal], minSum[1] + mn[pVal ^ 1]));
```

**③ 更新 minSum**：将 `y` 这一支纳入 `x` 到后代的候选，每种奇偶性取最小：

```
minSum[0] = min(minSum[0], mn[0])
minSum[1] = min(minSum[1], mn[1])
```

遍历完所有子节点后将 minSum 返回父节点。

---

## 代码实现

```java
class Solution {

    private static final long INF = Long.MAX_VALUE / 4;
    private long ans = INF;

    public int minActivationCost(int[][] edges, int[] values) {
        List<int[]>[] g = new ArrayList[values.length];
        Arrays.setAll(g, _ -> new ArrayList());

        for (int[] e : edges) {
            int x = e[0], y = e[1], c = e[2];
            g[x].add(new int[]{y, c});
            g[y].add(new int[]{x, c});
        }

        dfs(0, -1, 0, g, values);
        return ans < INF ? (int) ans : -1;
    }

    private long[] dfs(int x, int fa, int pOnes, List<int[]>[] g, int[] values) {
        int pVal = Integer.bitCount(values[x]) % 2;
        pOnes ^= pVal;
        long[] minSum = {INF, INF};

        minSum[pOnes] = 0;

        for (int[] e : g[x]) {
            int y = e[0], c = e[1];
            if (y == fa) continue;

            long[] mn = dfs(y, x, pOnes, g, values);
            mn[0] += c;
            mn[1] += c;

            ans = Math.min(ans, Math.min(minSum[0] + mn[pVal], minSum[1] + mn[pVal ^ 1]));
            minSum[0] = Math.min(minSum[0], mn[0]);
            minSum[1] = Math.min(minSum[1], mn[1]);
        }

        return minSum;
    }
}
```

---

## 复杂度

<table width="100%" style="display:table"><colgroup><col width="70"><col></colgroup><tbody>
<tr><td>⏱ 时间</td><td>O(n)</td></tr>
<tr><td>📦 空间</td><td>O(n)</td></tr>
</tbody></table>