---
date: '2026-11-08'
draft: false
title: '双周赛 195-3. 统计有效子串的数目 II'
categories: ['算法']
tags: ['LeetCode', '双指针', '滑动窗口']
---

## 题目信息

<table width="100%" style="display:table"><colgroup><col width="70"><col></colgroup><tbody>
<tr><td>🔗 链接</td><td><a href="https://leetcode.cn/problems/count-valid-substrings-ii/">LeetCode 双周赛 195-3</a></td></tr>
<tr><td>🏷 难度</td><td><strong>困难</strong></td></tr>
<tr><td>📌 标签</td><td>双指针 · 滑动窗口</td></tr>
</tbody></table>

---

## 题目描述

给定一个仅由字符 `'a'`、`'b'` 和 `'c'` 组成的字符串 `s`。

如果一个字符串**不包含** `"abc"` 作为**子序列**，那么它被称为**有效的**。

> **子序列**是指从字符串中删除一些或不删除字符，且不改变剩余字符顺序所得到的新字符串。

返回 `s` 中有效子串的数量。

---

## 思路分析

与 T1 的关键区别：T1 禁止的是连续的 `"abc"`，本题禁止的是**不连续**的 `"abc"` 子序列。这意味着只要子串中存在一个 `'a'` 在某个 `'b'` 之前、且该 `'b'` 在某个 `'c'` 之前，该子串就无效。

### 核心问题：如何检测子序列 `"abc"`

维护三个"最近出现位置"：

```
lastA               = 最近一次 'a' 的位置
lastB               = 最近一次 'b' 的位置
lastA_before_lastB  = 最近一次 'b' 出现之前，最近的那个 'a' 的位置
```

`lastA_before_lastB` 是本题的灵魂变量——它记录了一对有效的 `(a, b)` 中 `a` 的位置。当后续遇到 `'c'` 时，这三个位置就构成了 `"abc"` 子序列。

### `left` 的移动时机

设 `left` 为当前最靠右的非法起点（即 ≤ `left` 的位置都不能作为有效子串的起点）。

遇到 `'c'` 时，如果 `lastA_before_lastB != -1`（说明存在一对 `(a, b)`），则任何起点 ≤ `lastA_before_lastB` 的子串都会包含这组 `"abc"` 子序列。更新：

```
left = max(left, lastA_before_lastB)
```

### 举例推导

`"abac"`：

<table width="100%" style="display:table"><colgroup><col width="50"><col width="60"><col width="70"><col width="70"><col width="60"><col width="70"><col></colgroup><tbody>
<tr><td>i</td><td>ch</td><td>lastA</td><td>lastB</td><td>a_before_b</td><td>left</td><td>新增</td><td>新增子串</td></tr>
<tr><td>0</td><td>'a'</td><td>0</td><td>-1</td><td>-1</td><td>-1</td><td>1</td><td>"a"</td></tr>
<tr><td>1</td><td>'b'</td><td>0</td><td>1</td><td>0</td><td>-1</td><td>2</td><td>"ab"、"b"</td></tr>
<tr><td>2</td><td>'a'</td><td>2</td><td>1</td><td>0</td><td>-1</td><td>3</td><td>"aba"、"ba"、"a"</td></tr>
<tr><td>3</td><td>'c'</td><td>2</td><td>1</td><td>0</td><td>0</td><td>3</td><td>"bac"、"ac"、"c"</td></tr>
</tbody></table>

> 累计 = 1 + 2 + 3 + 3 = **9**

对比 T1（子串版本）：答案为 10，多出的那个是 `"abac"`。原因：`"abac"` 不含连续 `"abc"`，但含子序列 `"abc"`（`a[0] → b[1] → c[3]`），因此本题中被排除。

再看 `"ababc"`：

<table width="100%" style="display:table"><colgroup><col width="50"><col width="60"><col width="70"><col width="70"><col width="70"><col width="60"><col width="70"><col></colgroup><tbody>
<tr><td>i</td><td>ch</td><td>lastA</td><td>lastB</td><td>a_before_b</td><td>left</td><td>新增</td><td>新增子串</td></tr>
<tr><td>0</td><td>'a'</td><td>0</td><td>-1</td><td>-1</td><td>-1</td><td>1</td><td>"a"</td></tr>
<tr><td>1</td><td>'b'</td><td>0</td><td>1</td><td>0</td><td>-1</td><td>2</td><td>"ab"、"b"</td></tr>
<tr><td>2</td><td>'a'</td><td>2</td><td>1</td><td>0</td><td>-1</td><td>3</td><td>"aba"、"ba"、"a"</td></tr>
<tr><td>3</td><td>'b'</td><td>2</td><td>3</td><td>2</td><td>-1</td><td>4</td><td>"abab"、"bab"、"ab"、"b"</td></tr>
<tr><td>4</td><td>'c'</td><td>2</td><td>3</td><td>2</td><td>2</td><td>2</td><td>"bc"、"c"</td></tr>
</tbody></table>

> 累计 = 1 + 2 + 3 + 4 + 2 = **12**

注意 `i=3` 时 `lastA_before_lastB` 更新为 2：上一次 `'b'`（位置 1）之前的最近 `'a'` 是 0，但现在的 `'b'`（位置 3）之前的最近 `'a'` 是 2，所以值刷新了。这保证了 `'c'` 到来时找到的是"最靠右"的 `(a,b)` 对，从而让 `left` 只跳到必要的位置。

---

## 代码实现

```java
class Solution {
    public long countValidSubstrings(String s) {
        int lastA = -1, lastB = -1, lastA_before_lastB = -1;
        int n = s.length(), left = -1;
        long ans = 0;

        for (int i = 0; i < n; i++) {
            char ch = s.charAt(i);
            if (ch == 'a') {
                lastA = i;
            } else if (ch == 'b') {
                lastA_before_lastB = lastA;
                lastB = i;
            } else {
                if (lastA_before_lastB != -1)
                    left = Math.max(left, lastA_before_lastB);
            }
            ans += i - left;
        }

        return ans;
    }
}
```

---

## T1 vs T3 对比

<table width="100%" style="display:table"><colgroup><col width="80"><col width="160"><col width="160"></colgroup><tbody>
<tr><td></td><td><strong>T1（子串版本）</strong></td><td><strong>T3（子序列版本）</strong></td></tr>
<tr><td>禁止条件</td><td>连续 <code>"abc"</code></td><td>不连续的 <code>"abc"</code> 子序列</td></tr>
<tr><td>left 更新</td><td>遇到 <code>'c'</code> 且前两字符为 <code>"ab"</code></td><td>遇到 <code>'c'</code> 且存在 <code>(a,b)</code> 对</td></tr>
<tr><td>left 值</td><td><code>i - 1</code></td><td><code>lastA_before_lastB</code></td></tr>
<tr><td>追踪状态</td><td>只看最近两个字符</td><td>维护三个"最近出现"指针</td></tr>
<tr><td>"abac" 答案</td><td>10</td><td>9（少了 <code>"abac"</code>）</td></tr>
</tbody></table>

---

## 要点总结

<table width="100%" style="display:table"><colgroup><col width="80"><col></colgroup><tbody>
<tr><td>💡 子序列检测</td><td>三个指针 <code>lastA</code>、<code>lastB</code>、<code>lastA_before_lastB</code> 协作，O(1) 判断是否存在 <code>"abc"</code> 子序列</td></tr>
<tr><td>💡 lastA_before_lastB</td><td>只在遇到 <code>'b'</code> 时更新为 <code>lastA</code>，确保记录的是"b 之前的 a"，而非"b 之后的 a"</td></tr>
<tr><td>💡 left 单调</td><td><code>Math.max(left, ...)</code> 保证 left 只增不减，每个位置只会被跳过一次</td></tr>
</tbody></table>

---

## 复杂度

<table width="100%" style="display:table"><colgroup><col width="70"><col></colgroup><tbody>
<tr><td>⏱ 时间</td><td>O(n)</td></tr>
<tr><td>📦 空间</td><td>O(1)</td></tr>
</tbody></table>