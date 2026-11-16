---
date: '2026-11-02'
draft: false
title: '周赛 528-4. 统计一致子数组数目 II'
categories: ['算法']
tags: ['LeetCode', '位运算', '数组']
---

## 题目信息

<table width="100%" style="display:table"><colgroup><col width="70"><col></colgroup><tbody>
<tr><td>🔗 链接</td><td><a href="https://leetcode.cn/problems/count-consistent-subarrays-ii/description/">LeetCode 周赛 528-4</a></td></tr>
<tr><td>🏷 难度</td><td><strong>困难</strong></td></tr>
<tr><td>📌 标签</td><td>位运算 · 数组</td></tr>
</tbody></table>

---

## 题目描述

给定一个整数数组 `nums`。若一个子数组的**最小值**等于它的**按位与值**，则称该子数组为**一致子数组**。

> 返回 `nums` 中一致子数组的总数。

---

## 思路分析

暴力枚举所有子数组是 O(n^2)，不可行。核心思路是：**固定右端点 `i`，利用 AND 值随左端点单调变化的性质，把 O(n) 个左端点压缩成至多 31 段**。

### 1. 一个子数组何时是"一致"的

设 `[l, i]` 的按位与为 `val`。AND 的结果 `val` 每一位都必须同时出现在 `[l, i]` 的**所有**元素里，也就是每个元素都是 `val` 的超集（bitwise super mask），因此每个元素都 `>= val`，最小值也 `>= val`：

```
min([l, i]) >= val
```

要让最小值**恰好等于** `val`，唯一条件是：`[l, i]` 里存在一个元素**刚好等于 `val`**。

> 一致，当且仅当：AND 为 `val`，且 `val` 本身出现在该子数组内。

### 2. AND 值单调，段数很少

按位与只会把 1 变 0，不会把 0 变回 1。所以固定右端点 `i`、左端点 `l` 从 `i` 向左扫时，AND 值**单调不增**，每变一次至少丢掉一个二进制位，因此**至多只有 31 种不同值**。

据此把"以 `i` 结尾的所有子数组"按 AND 值分成若干段，每段用 `[andVal, left]` 表示：`left` 是该段最靠左的起点，段内任意左端点 `l` 的 AND 都等于 `andVal`。

### 3. 维护两个结构

<table width="100%" style="display:table"><colgroup><col width="70"><col></colgroup><tbody>
<tr><td>`data`</td><td>以 `i` 结尾的子数组中，所有不同的 AND 值及其最左起点，形如 `[andVal, left]`</td></tr>
<tr><td>`pos`</td><td>哈希表，记录每个数值最后一次出现的下标</td></tr>
</tbody></table>

### 4. 扫描与计数

遍历 `i`，取出 `x = nums[i]`，分四步：

**① 更新 AND**：把 `data` 里每个 AND 值 `&= x`（这些子数组都新增了元素 `x`），再追加 `[x, i]` 表示只含 `x` 的子数组。

**② 去重**：相邻相同 AND 值合并，保留最靠左的起点。

**③ 计数**：对每段 `(val, left)`，查 `pos[val]` 得到 `val` 最后一次出现的下标 `right`。

关键点：`right` 一定落在"AND 值等于 `val`"的这段里——否则 `right` 所在的相邻段 AND 也会等于 `val`，去重时就被合并了。因此满足"一致"的左端点恰好是 `[left, right]`，贡献：

```
right - left + 1
```

**④ 记录位置**：`pos[x] = i`。

> 注：代码里的单调栈 `st` 是残留结构，最终答案并未使用它。

---

## 代码实现

```java
class Solution {
    public long countConsistent(int[] nums) {
        int n = nums.length;
        List<int[]> data = new ArrayList();   // [andVal, left]
        List<Integer> st = new ArrayList();   // 残留结构，未参与计算
        Map<Integer, Integer> pos = new HashMap(); // 每个值最后出现的位置
        long ans = 0;

        for (int i = 0; i < n; i++) {
            int x = nums[i];

            while (!st.isEmpty() && nums[st.get(st.size() - 1)] >= x) {
                st.remove(st.size() - 1);
            }
            st.add(i);

            pos.put(x, i);

            // ① 更新每个子数组的 AND，并加入只含 x 的子数组
            for (int[] p : data) {
                p[0] &= x;
            }
            data.add(new int[] { x, i });

            // ② 去重：相邻相同的 AND 值合并，保留最左起点
            int m = 1;
            for (int j = 1; j < data.size(); j++) {
                if (data.get(j)[0] != data.get(j - 1)[0]) {
                    data.set(m++, data.get(j));
                }
            }
            data.subList(m, data.size()).clear();

            // ③ 计数
            for (int k = 0; k < m; k++) {
                int val = data.get(k)[0];
                Integer right = pos.get(val);
                if (right == null) {
                    continue;
                }
                int left = data.get(k)[1];
                ans += Math.max(0, right - left + 1);
            }
        }
        return ans;
    }
}
```

---

## 复杂度

<table width="100%" style="display:table"><colgroup><col width="70"><col></colgroup><tbody>
<tr><td>⏱ 时间</td><td>O(n log U)，其中 U 为 nums 中的最大值（每个右端点至多产生 31 种 AND 值）</td></tr>
<tr><td>📦 空间</td><td>O(n)（pos 哈希表最坏 O(n)，data 恒为 O(log U)）</td></tr>
</tbody></table>