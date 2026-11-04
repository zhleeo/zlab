---
date: '2026-10-31'
draft: false
title: 'LCP 18. 早餐组合'
categories: ['算法']
tags: ['LeetCode', '双指针', '排序']
---

## 题目信息

<table width="100%" style="display:table"><colgroup><col width="70"><col></colgroup><tbody>
<tr><td>🔗 链接</td><td><a href="https://leetcode.cn/problems/2vYnGI/">LeetCode LCP 18</a></td></tr>
<tr><td>🏷 难度</td><td><strong>简单</strong></td></tr>
<tr><td>📌 标签</td><td>排序 · 双指针</td></tr>
</tbody></table>

---

## 题目描述

小扣在秋日市集选择了一家早餐摊位，一维整型数组 `staple` 中记录了每种主食的价格，一维整型数组 `drinks` 中记录了每种饮料的价格。小扣计划选择**一份主食**和**一款饮料**，且花费不超过 `x` 元。

> 请返回共有多少种购买方案，答案需要对 `1e9 + 7 (1000000007)` 取模。

---

## 思路分析

暴力枚举 O(n²) 会超时，核心思路是**排序 + 双指针**来避免重复扫描。

### 排序

将 `staple` 和 `drinks` 分别升序排序。排序后，数组具有单调性，为双指针创造条件。

### 双指针扫描

设置左指针 `left = 0` 遍历主食，右指针 `right = drinks.length - 1` 从饮料最大值开始：

- 若 `staple[left] + drinks[right] > x`：当前饮料太贵，`right--` 尝试更便宜的饮料
- 若 `staple[left] + drinks[right] <= x`：**当前主食与 drinks[0..right] 的所有饮料都满足条件**（因为 drinks 已排序，左边的都 ≤ drinks[right]），因此 `ans += right + 1`，然后 `left++` 换下一个主食

### 关键优化

- 当 `staple[left] > x` 时，该主食本身就超出了预算，后续主食只会更大（已排序），直接 `break`
- 每次累加后对 `1e9+7` 取模，防止溢出

---

## 代码实现

```java
class Solution {
    public int breakfastNumber(int[] staple, int[] drinks, int x) {
        Arrays.sort(staple);
        Arrays.sort(drinks);
        long ans = 0;

        int left = 0, right = drinks.length - 1;

        while (left < staple.length && right >= 0) {
            if (staple[left] > x) break;
            int sum = staple[left] + drinks[right];

            if (sum > x) {
                right--;
            } else {
                ans += right + 1;
                ans = ans % 1000000007;
                left++;
            }
        }

        return (int) ans;
    }
}
```

---

## 复杂度

<table width="100%" style="display:table"><colgroup><col width="70"><col></colgroup><tbody>
<tr><td>⏱ 时间</td><td>O(n log n + m log m)，排序开销，双指针扫描为 O(n + m)</td></tr>
<tr><td>📦 空间</td><td>O(1)，仅使用常数级额外空间</td></tr>
</tbody></table>