---
date: '2026-11-08'
draft: false
title: '双周赛 195-4. 重复字符串匹配 II'
categories: ['算法']
tags: ['LeetCode', '字符串', '数学']
---

## 题目信息

<table width="100%" style="display:table"><colgroup><col width="70"><col></colgroup><tbody>
<tr><td>🔗 链接</td><td><a href="https://leetcode.cn/problems/repeated-string-match-ii/">LeetCode 双周赛 195-4</a></td></tr>
<tr><td>🏷 难度</td><td><strong>困难</strong></td></tr>
<tr><td>📌 标签</td><td>字符串 · 数学</td></tr>
</tbody></table>

---

## 题目描述

给定字符串 `a`、`b` 和整数 `x`、`y`。判断将 `b` 重复 `y` 次得到的串是否为将 `a` 重复 `x` 次得到的串的**子串**。

> `a.length, b.length ≤ 100`，但 `x, y ≤ 10⁹`，无法实际构造重复后的字符串。

---

## 思路分析

直接构造 `a*x` 和 `b*y` 不可行（长度可达 10¹¹）。关键洞察：两个串都是**周期串**，可以利用周期性质在 O(LCM) 级别完成匹配。

### 第一步：长度预判

`b*y` 要成为 `a*x` 的子串，长度上必须满足：

```
lenB × y ≤ lenA × x
```

不满足直接返回 `false`。

### 第二步：枚举起始位置

`a*x` 是周期为 `lenA` 的串，任何位置 `p` 的字符等于 `a[p % lenA]`。因此只需枚举起始位置在**第一个 `a` 周期内**（`0` 到 `lenA-1`）即可覆盖所有可能的对齐方式。

对于每个起始位置 `start`，还需保证 `b*y` 不超出 `a*x` 的边界：

```
start + y × lenB ≤ x × lenA
```

### 第三步：LCM 截断验证

比对两个串时，逐位置看的是**一对索引**：

```
位置 i：比较 a[(start + i) % lenA] 和 b[i % lenB]
```

关键问题是：这对索引什么时候开始重复？

**具体例子**：设 `lenA = 3`，`lenB = 2`，`start = 0`：

<table width="100%" style="display:table"><colgroup><col width="60"><col width="140"><col width="140"><col></colgroup><tbody>
<tr><td>i</td><td>a 的索引<br><code>(start+i) % 3</code></td><td>b 的索引<br><code>i % 2</code></td><td>索引对</td></tr>
<tr><td>0</td><td>0</td><td>0</td><td>(0, 0)</td></tr>
<tr><td>1</td><td>1</td><td>1</td><td>(1, 1)</td></tr>
<tr><td>2</td><td>2</td><td>0</td><td>(2, 0)</td></tr>
<tr><td>3</td><td>0</td><td>1</td><td>(0, 1)</td></tr>
<tr><td>4</td><td>1</td><td>0</td><td>(1, 0)</td></tr>
<tr><td>5</td><td>2</td><td>1</td><td>(2, 1)</td></tr>
<tr><td><strong>6</strong></td><td><strong>0</strong></td><td><strong>0</strong></td><td><strong>(0, 0) ← 回到了 i=0 的索引对！</strong></td></tr>
</tbody></table>

`a` 的索引每隔 `3` 复位，`b` 的索引每隔 `2` 复位。两者**同时复位**的最小间隔是 `LCM(3, 2) = 6`。一旦索引对开始重复，比较的就是已经比过的字符组合——所以比 6 个就够了。

**一般情况**：a 的索引周期 = `lenA`，b 的索引周期 = `lenB`。索引对 `(a_idx, b_idx)` 的周期 = `LCM(lenA, lenB)`。因此：

- 比完 `L = LCM` 个位置后，第 `L` 个位置会回到第 `0` 个位置的索引对，之后循环往复
- 只要前 `L` 个位置全部匹配，后续所有位置自动匹配（因为看到的索引对完全一样）

实际只需比对 `r = min(LCM, y × lenB)` 个字符：
- 若 `b*y` 的长度 ≥ LCM：比 LCM 个即可
- 若 `b*y` 的长度 < LCM：比满整个 `b*y`

### 举例推导

`a = "ab"`，`b = "abab"`，`x = 2`，`y = 1`：

- `lenA × x = 2 × 2 = 4`，`lenB × y = 4 × 1 = 4` ✅
- `LCM(2, 4) = 4`
- `start = 0`：比 4 个字符
  - `a[0]=a`, `b[0]=a` ✅
  - `a[1]=b`, `b[1]=b` ✅
  - `a[0]=a`, `b[2]=a` ✅
  - `a[1]=b`, `b[3]=b` ✅
- 全部匹配 → `true`

`a = "abcd"`，`b = "cdab"`，`x = 2`，`y = 1`：

- `LCM(4, 4) = 4`
- `start = 0`：`a[0..3] = "abcd"` vs `b[0..3] = "cdab"` → 不匹配
- `start = 1`：`a[1..4] = "bcda"` vs `b = "cdab"` → 不匹配
- `start = 2`：`a[2..5] = "cdab"` vs `b = "cdab"` → ✅ 匹配 → `true`

---

## 代码实现

```java
class Solution {
    public boolean repeatedStringMatch(String a, String b, int x, int y) {
        int lenA = a.length();
        int lenB = b.length();

        if ((long) lenA * x < (long) lenB * y) return false;

        int lm = lcm(lenA, lenB);

        for (long start = 0; start < lenA; start++) {
            if (start + (long) y * lenB > (long) x * lenA) break;

            int r = (int) Math.min(lm, (long) y * lenB);
            boolean match = true;

            for (int i = 0; i < r; i++) {
                if (a.charAt((int) (start + i) % lenA) != b.charAt(i % lenB)) {
                    match = false;
                    break;
                }
            }

            if (match) return true;
        }

        return false;
    }

    private int gcd(int a, int b) {
        return b == 0 ? a : gcd(b, a % b);
    }

    private int lcm(int a, int b) {
        return a / gcd(a, b) * b;
    }
}
```

---

## 要点总结

<table width="100%" style="display:table"><colgroup><col width="80"><col></colgroup><tbody>
<tr><td>💡 LCM 截断</td><td>两个周期串只需比对 LCM 个字符即可判定全局匹配，由周期性严格保证</td></tr>
<tr><td>💡 枚举范围</td><td>起始位置仅需枚举 <code>0 ~ lenA-1</code>，因为 <code>a*x</code> 以 <code>lenA</code> 为周期</td></tr>
<tr><td>💡 取模定位</td><td><code>(start+i) % lenA</code> 和 <code>i % lenB</code> 将任意位置映射回原串，无需构造重复串</td></tr>
<tr><td>💡 提前剪枝</td><td>长度不足或起始位置越界时提前终止，避免无效计算</td></tr>
</tbody></table>

---

## 复杂度

<table width="100%" style="display:table"><colgroup><col width="70"><col></colgroup><tbody>
<tr><td>⏱ 时间</td><td>O(lenA · LCM(lenA, lenB))，最坏 O(100 × 10000) = 10⁶</td></tr>
<tr><td>📦 空间</td><td>O(1)</td></tr>
</tbody></table>