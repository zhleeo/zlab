---
date: '2026-11-08'
draft: false
title: '双周赛 195-1. 统计有效子串的数目 I'
categories: ['算法']
tags: ['LeetCode', '双指针', '滑动窗口']
---

## 题目信息

<table width="100%" style="display:table"><colgroup><col width="70"><col></colgroup><tbody>
<tr><td>🔗 链接</td><td><a href="https://leetcode.cn/problems/count-valid-substrings-i/description/">LeetCode 双周赛 195-1</a></td></tr>
<tr><td>🏷 难度</td><td><strong>中等</strong></td></tr>
<tr><td>📌 标签</td><td>双指针 · 滑动窗口</td></tr>
</tbody></table>

---

## 题目描述

给定一个仅由字符 `'a'`、`'b'` 和 `'c'` 组成的字符串 `s`。

如果一个字符串**不包含** `"abc"` 作为子串，那么它被称为**有效的**。

> 返回 `s` 中**有效子串**的数量。起始或结束下标不同的子串分别计数。

---

## 思路分析

核心思想：维护一个滑动窗口，`left` 表示当前右端点 `i` 对应的**最靠左的合法起点**。对于每个位置 `i`，以 `i` 结尾的有效子串数量为 `i - left + 1`。

### 关键：何时移动 `left`

当在 `i` 处检测到 `"abc"`（即 `s[i-2]='a'`、`s[i-1]='b'`、`s[i]='c'`）时，任何起点 ≤ `i-2` 的子串都会把 `"abc"` 包进去，变成无效。

因此 `left` 必须跳到 `i-1`——紧挨在 `'a'` 之后，这样所有以 `i` 或之后位置结尾的子串都不会再包含这组 `"abc"`。

### 举例验证

`"abac"`：

<table width="100%" style="display:table"><colgroup><col width="50"><col width="100"><col width="60"><col width="70"><col></colgroup><tbody>
<tr><td>i</td><td>字符</td><td>left</td><td>新增数</td><td>新增子串</td></tr>
<tr><td>0</td><td>'a'</td><td>0</td><td>1</td><td>"a"</td></tr>
<tr><td>1</td><td>'b'</td><td>0</td><td>2</td><td>"ab"、"b"</td></tr>
<tr><td>2</td><td>'a'</td><td>0</td><td>3</td><td>"aba"、"ba"、"a"</td></tr>
<tr><td>3</td><td>'c'</td><td>0</td><td>4</td><td>"abac"、"bac"、"ac"、"c"</td></tr>
</tbody></table>

> 累计 = 1 + 2 + 3 + 4 = **10**

注意 `s[1..3] = "bac"` 虽包含 `'a'`、`'b'`、`'c'`，但顺序不符，依然有效。

---

`"abc"`（触发 `left` 跳变）：

<table width="100%" style="display:table"><colgroup><col width="50"><col width="100"><col width="60"><col width="70"><col></colgroup><tbody>
<tr><td>i</td><td>字符</td><td>left</td><td>新增数</td><td>新增子串</td></tr>
<tr><td>0</td><td>'a'</td><td>0</td><td>1</td><td>"a"</td></tr>
<tr><td>1</td><td>'b'</td><td>0</td><td>2</td><td>"ab"、"b"</td></tr>
<tr><td>2</td><td>'c'</td><td>1</td><td>2</td><td>"bc"、"c"</td></tr>
</tbody></table>

> 累计 = 1 + 2 + 2 = **5**

`i=2` 时遇到 `"abc"`，`left` 从 0 跳到 1，避开了会引入 `"abc"` 的起点。

---

## 代码实现

```java
class Solution {
    public long countValidSubstrings(String s) {
        long ans = 0;
        int i = 0, n = s.length();
        int left = 0;

        while (i < n) {
            if (i >= 2 && s.charAt(i) == 'c' && s.charAt(i - 1) == 'b' && s.charAt(i - 2) == 'a')
                left = i - 1;
            ans += i - left + 1;
            i++;
        }

        return ans;
    }
}
```

---

## 要点总结

<table width="100%" style="display:table"><colgroup><col width="80"><col></colgroup><tbody>
<tr><td>💡 增量公式</td><td>每扩展一位，新增有效子串数为 <code>i - left + 1</code>，无需重复枚举</td></tr>
<tr><td>💡 left 跳变</td><td>仅在遇到 <code>"abc"</code> 时触发，跳到 <code>i-1</code> 恰好避开带 <code>"abc"</code> 的起点</td></tr>
<tr><td>💡 顺序敏感</td><td>只有连续且顺序一致的 <code>"abc"</code> 才需排除，打乱顺序（如 <code>"bac"</code>）不算</td></tr>
</tbody></table>

---

## 复杂度

<table width="100%" style="display:table"><colgroup><col width="70"><col></colgroup><tbody>
<tr><td>⏱ 时间</td><td>O(n)</td></tr>
<tr><td>📦 空间</td><td>O(1)</td></tr>
</tbody></table>