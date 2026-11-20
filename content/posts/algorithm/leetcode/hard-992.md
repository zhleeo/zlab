---
date: '2026-11-20'
draft: false
title: '992. K 个不同整数的子数组'
categories: ['算法']
tags: ['LeetCode', '滑动窗口', '双指针', '数组']
---

## 题目信息

<table width="100%" style="display:table"><colgroup><col width="70"><col></colgroup><tbody>
<tr><td>🔗 链接</td><td><a href="https://leetcode.cn/problems/subarrays-with-k-different-integers/description/">LeetCode 992</a></td></tr>
<tr><td>🏷 难度</td><td><strong>困难</strong></td></tr>
<tr><td>📌 标签</td><td>滑动窗口 · 双指针 · 数组</td></tr>
</tbody></table>

---

## 题目描述

给定正整数数组 `nums` 和整数 `k`，返回**恰好**包含 `k` 个不同整数的子数组数目。

> 数据范围：`1 ≤ nums.length ≤ 2 × 10⁴`，`1 ≤ nums[i] ≤ nums.length`，`1 ≤ k ≤ nums.length`。

---

## 思路分析

直接维护「恰好 k 个」的窗口很别扭：固定右端点 `right` 时，合法左端点是一段连续区间 `[L_k, L_{k-1}−1]`，需要两条左边界，而标准滑动窗口只维护一条。所以换个思路，**把「恰好」转成「至多」**：

```
恰好 k 个 = 至多 k 个 − 至多 (k−1) 个
```

设 `f(x)` 表示「不同整数个数 ≤ x」的子数组数量，答案即为 `f(k) − f(k−1)`。这个套路适用于一类「恰好 k」计数题，如 930、1248。

### 求 f(x)：至多 x 个

滑动窗口维护「不同整数个数 ≤ x」的最宽窗口：

- `right` 每右移一位，`nums[right]` 加入频率数组 `mem`；若此前出现次数为 0，则 `cnt++`。
- 当 `cnt > x` 时收缩 `left`：`mem[nums[left]]--`，减到 0 则 `cnt--`，直到 `cnt ≤ x`。
- 此时 `[left, right]` 内任何起点都合法，以 `right` 结尾的子数组共 `right − left + 1` 个，累加即可。

`left` 只增不减，全程移动不超过 `n` 次，因此每次 `f(x)` 都是 O(n)。

由于 `1 ≤ nums[i] ≤ n`，可直接用 `mem[n+1]` 数组当频率表，省去 HashMap；答案上界 `n(n+1)/2`（`n = 2×10⁴` 时约 `2×10⁸`），`int` 不溢出。

---

## 举例验证

以 `nums = [1,2,1,2,3]`、`k = 2` 为例。

**f(2)：至多 2 个不同整数**

<table width="100%" style="display:table"><colgroup><col width="50"><col width="70"><col width="60"><col width="50"><col width="60"><col></colgroup><tbody>
<tr><td>right</td><td>nums[right]</td><td>cnt</td><td>left</td><td>新增数</td><td>说明</td></tr>
<tr><td>0</td><td>1</td><td>1</td><td>0</td><td>1</td><td>[1]</td></tr>
<tr><td>1</td><td>2</td><td>2</td><td>0</td><td>2</td><td>[1,2]、[2]</td></tr>
<tr><td>2</td><td>1</td><td>2</td><td>0</td><td>3</td><td>[1,2,1]、[2,1]、[1]</td></tr>
<tr><td>3</td><td>2</td><td>2</td><td>0</td><td>4</td><td>[1,2,1,2]、[2,1,2]、[1,2]、[2]</td></tr>
<tr><td>4</td><td>3</td><td>3→2</td><td>3</td><td>2</td><td>收缩后 [2,3]、[3]</td></tr>
</tbody></table>

> `f(2) = 1 + 2 + 3 + 4 + 2 = 12`

**f(1)：至多 1 个不同整数**

<table width="100%" style="display:table"><colgroup><col width="50"><col width="70"><col width="60"><col width="50"><col width="60"><col></colgroup><tbody>
<tr><td>right</td><td>nums[right]</td><td>cnt</td><td>left</td><td>新增数</td><td>说明</td></tr>
<tr><td>0</td><td>1</td><td>1</td><td>0</td><td>1</td><td>[1]</td></tr>
<tr><td>1</td><td>2</td><td>2→1</td><td>1</td><td>1</td><td>[2]</td></tr>
<tr><td>2</td><td>1</td><td>2→1</td><td>2</td><td>1</td><td>[1]</td></tr>
<tr><td>3</td><td>2</td><td>2→1</td><td>3</td><td>1</td><td>[2]</td></tr>
<tr><td>4</td><td>3</td><td>2→1</td><td>4</td><td>1</td><td>[3]</td></tr>
</tbody></table>

> `f(1) = 1 + 1 + 1 + 1 + 1 = 5`

结果：`f(2) − f(1) = 12 − 5 = 7` ✅（7 个好子数组：[1,2]、[2,1]、[1,2,1]、[1,2]、[2,1,2]、[1,2,1,2]、[2,3]）

---

## 代码实现

```java
class Solution {
    public int subarraysWithKDistinct(int[] nums, int k) {
        return subarrays(nums, k) - subarrays(nums, k - 1);
    }

    // 统计「不同整数个数 ≤ k」的子数组数量
    public int subarrays(int[] nums, int k) {
        int n = nums.length;
        int[] mem = new int[n + 1];   // nums[i] ∈ [1, n]，用数组当频率表
        int cnt = 0, left = 0, right = 0, ans = 0;

        while (right < n) {
            if (mem[nums[right]] == 0) cnt++;
            mem[nums[right]]++;

            while (cnt > k) {
                mem[nums[left]]--;
                if (mem[nums[left]] == 0) cnt--;
                left++;
            }

            ans += right - left + 1;
            right++;
        }

        return ans;
    }
}
```

---

## 要点总结

<table width="100%" style="display:table"><colgroup><col width="90"><col></colgroup><tbody>
<tr><td>💡 恰好转至多</td><td><code>恰好 k = 至多 k − 至多 (k−1)</code>，避开双左指针的复杂写法</td></tr>
<tr><td>💡 增量公式</td><td>每个 <code>right</code> 贡献 <code>right - left + 1</code> 个子数组，无需枚举起点</td></tr>
<tr><td>💡 数组代替哈希</td><td><code>nums[i] ∈ [1, n]</code>，用 <code>mem[n+1]</code> 直接当下标做频率表</td></tr>
<tr><td>💡 k−1=0 自动成立</td><td><code>subarrays(nums, 0)</code> 会收缩为空窗口、贡献 0，<code>k=1</code> 无需特判</td></tr>
</tbody></table>

---

## 复杂度

<table width="100%" style="display:table"><colgroup><col width="70"><col></colgroup><tbody>
<tr><td>⏱ 时间</td><td>O(n)（两次滑动窗口）</td></tr>
<tr><td>📦 空间</td><td>O(n)（频率数组 mem）</td></tr>
</tbody></table>