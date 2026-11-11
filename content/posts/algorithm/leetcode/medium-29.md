---
date: '2026-11-11'
draft: false
title: '29. 两数相除'
categories: ['算法']
tags: ['LeetCode', '位运算', '数学']
---

## 题目信息

<table width="100%" style="display:table"><colgroup><col width="70"><col></colgroup><tbody>
<tr><td>🔗 链接</td><td><a href="https://leetcode.cn/problems/divide-two-integers/">LeetCode 29</a></td></tr>
<tr><td>🏷 难度</td><td><strong>中等</strong></td></tr>
<tr><td>📌 标签</td><td>位运算 · 数学</td></tr>
</tbody></table>

---

## 题目描述

给定两个 32 位有符号整数 `dividend`（被除数）和 `divisor`（除数），计算两者相除的商，要求：

- ❌ **不能使用** `*`（乘法）、`/`（除法）、`%`（取模）运算符
- ✅ 结果**向零截断**（去掉小数部分）
- ✅ 若结果超出 32 位整数范围 `[−2³¹, 2³¹−1]`，返回对应边界值

> 返回被除数 `dividend` 除以除数 `divisor` 得到的商。

---

## 思路分析

不能用乘除模运算，最直观的替代是**逐次相减**：反复从 `dividend` 中减去 `divisor`，统计能减多少次。但被除数最大可达 `2³¹`，逐次相减会退化成 O(n)，必然超时。因此需要**倍增法**（类似快速幂的"翻倍试探"）来加速。

### 第一步：处理溢出特例

`int` 的负数范围比正数多一个：`MIN_VALUE = −2³¹`，而正数最大只有 `2³¹−1`。当 `dividend = MIN_VALUE` 且 `divisor = −1` 时，真实结果为 `2³¹`，超出 `int` 上限，直接返回 `MAX_VALUE`。

```java
if (dividend == Integer.MIN_VALUE && divisor == -1) return Integer.MAX_VALUE;
```

### 第二步：确定符号

同号相除为正、异号相除为负：

```
sign = 1（同号） 或 −1（异号）
```

### 第三步：统一转成负数参与运算

这是本题最关键的一步。因为 `−MIN_VALUE` 会溢出（`2³¹` 存不进 `int`），所以**不能**把负数转成正数；反过来，正数转负数却是安全的。于是把两个数都**统一到非正数域**：

```
dividend = dividend <= 0 ? dividend : -dividend;   // 正数取负，负数保持
divisor  = divisor  <= 0 ? divisor  : -divisor;
```

> 负数域下比较大小关系要反过来：`dividend <= divisor` 等价于 `|dividend| >= |divisor|`。

### 第四步：倍增法求商

核心思想：每次不逐减一个 `divisor`，而是**翻倍地减**——先找到能一次减掉的最大 `divisor` 倍数，把 O(n) 的逐次相减压缩到 O(log n) 级别。

```java
while (dividend <= divisor) {          // 负数域：|被除数| 仍 >= |除数|
    int tem = divisor, cnt = 1;        // tem 为待减倍数，cnt 为对应的商贡献
    while (dividend - tem <= tem) {    // 减掉一个 tem 后，还能再减一个 tem？
        tem += tem;                    // 翻倍
        cnt += cnt;
    }
    dividend -= tem;                   // 减去当前最大倍数
    ans += cnt;                        // 累加商
}
```

**内层循环条件 `dividend - tem <= tem` 的含义：**

`tem` 是负数，`tem += tem` 会令其绝对值翻倍（更负）。`dividend - tem` 表示从 `dividend` 中"减掉一个 `tem`"后的剩余。条件 `dividend - tem <= tem` 即"剩余仍 ≤ 一个 `tem`"，说明还能再减一个 `tem`，等价于 `|dividend| >= 2·|tem|`，因此可以放心翻倍。

---

## 举例验证

以 `dividend = 10`，`divisor = 3` 为例（结果应为 `3`）：

- `sign = 1`（同号为正）
- 统一转负：`dividend = −10`，`divisor = −3`，`ans = 0`

**第一轮**（`−10 <= −3` 成立）：

- `tem = −3`，`cnt = 1`
- 内层：`−10 − (−3) = −7 <= −3` 成立 → `tem = −6`，`cnt = 2`
- 内层：`−10 − (−6) = −4 <= −6` 不成立 → 停止
- `dividend = −10 − (−6) = −4`，`ans = 2`

**第二轮**（`−4 <= −3` 成立）：

- `tem = −3`，`cnt = 1`
- 内层：`−4 − (−3) = −1 <= −3` 不成立 → 停止
- `dividend = −4 − (−3) = −1`，`ans = 3`

**第三轮**（`−1 <= −3` 不成立）→ 结束

返回 `sign * ans = 1 * 3 = 3` ✅

---

## 代码实现

```java
class Solution {
    public int divide(int dividend, int divisor) {
        if (dividend == Integer.MIN_VALUE && divisor == -1) return Integer.MAX_VALUE;

        int sign = ((dividend < 0 && divisor < 0) || (dividend > 0 && divisor > 0)) ? 1 : -1;

        dividend = dividend <= 0 ? dividend : -dividend;
        divisor = divisor <= 0 ? divisor : -divisor;
        int ans = 0;

        while (dividend <= divisor) {
            int tem = divisor, cnt = 1;
            while (dividend - tem <= tem) {
                tem += tem;
                cnt += cnt;
            }
            dividend -= tem;
            ans += cnt;
        }

        return sign == 1 ? ans : -ans;
    }
}
```

---

## 要点总结

<table width="100%" style="display:table"><colgroup><col width="80"><col></colgroup><tbody>
<tr><td>💡 溢出特判</td><td>`MIN_VALUE / −1` 结果为 `2³¹` 溢出，必须提前返回 `MAX_VALUE`</td></tr>
<tr><td>💡 统一转负</td><td>负数域比正数域多一个值，把两数都转成非正数，规避 `−MIN_VALUE` 溢出</td></tr>
<tr><td>💡 倍增加速</td><td>每次翻倍减，把逐次相减的 O(n) 压缩到对数级</td></tr>
<tr><td>💡 负数比较</td><td>负数域下 `<=` 方向反转，等价于绝对值的 `>=`，勿混淆</td></tr>
</tbody></table>

---

## 复杂度

<table width="100%" style="display:table"><colgroup><col width="70"><col></colgroup><tbody>
<tr><td>⏱ 时间</td><td>O(log² n)（外层至多 log n 轮，每轮内层至多 log n 次倍增；因输入为 32 位整数，实际最多约 500 次运算，可视为常数）</td></tr>
<tr><td>📦 空间</td><td>O(1)</td></tr>
</tbody></table>