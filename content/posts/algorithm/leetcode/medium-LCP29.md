---
date: '2026-11-06'
draft: false
title: 'LCP 29. 乐团站位'
categories: ['算法']
tags: ['LeetCode', '数学']
---

## 题目信息

<table width="100%" style="display:table"><colgroup><col width="70"><col></colgroup><tbody>
<tr><td>🔗 链接</td><td><a href="https://leetcode.cn/problems/SNJvJP/">LeetCode LCP 29</a></td></tr>
<tr><td>🏷 难度</td><td><strong>中等</strong></td></tr>
<tr><td>📌 标签</td><td>数学</td></tr>
</tbody></table>

---

## 题目描述

乐团演出场地是一个 `num × num` 的二维矩阵（左上角坐标 `[0, 0]`），每个位置站一位成员。乐团共 **9 种乐器**（编号 `1~9`），每位成员持有 1 个乐器。

成员座位规则：自左上角开始，**顺时针螺旋向内**依次以 `1, 2, ..., 9` 循环排列。

> 给定场地大小 `num` 和坐标 `(Xpos, Ypos)`，返回该位置成员所持乐器编号。

---

## 思路分析

`num` 最大可达 **10⁹**，无法构造矩阵。需要利用螺旋矩阵的数学性质直接计算坐标在序列中的位置。

### 第一步：定位圈层

对于 `n × n` 矩阵中的坐标 `(i, j)`，它到四条边的距离分别是 `i`（上）、`j`（左）、`n-1-i`（下）、`n-1-j`（右），取四者最小值即为所在圈层：

```
k = min(i, j, n-1-i, n-1-j)
```

`k` 从 0 开始，最外层为第 0 圈。剥掉 `k` 层后，内层边长变为 `n − 2k`。

### 第二步：计算外圈元素总数

圈层 `k` 之前的所有元素，等于**整个矩阵元素数**减去**内层子矩阵元素数**：

> 外层元素数 = `n² − (n − 2k)²`

**推导过程：**

整个矩阵有 `n²` 个元素。剥掉 `k` 层后，内层子矩阵边长为 `n − 2k`（上下各去掉 `k` 行、左右各去掉 `k` 列），包含 `(n − 2k)²` 个元素。两者相减即得外圈元素总数。

**逐层累加验证：**

第 0 层周长 = `4n − 4`，第 1 层周长 = `4(n−2) − 4`，……，构成等差数列。前 `k` 层累加：

> `4[(n−1) + (n−3) + ... + (n−2k+1)]` = `4k(n − k)` = `4kn − 4k²`

展开 `n² − (n − 2k)²` 同样等于 `4kn − 4k²`，两种方法等价。前者一行公式更简洁。

### 第三步：计算圈内偏移

在第 `k` 圈内，边长 `len = n − 2k`，从左上角开始顺时针遍历：

<table width="100%" style="display:table"><colgroup><col width="160"><col></colgroup><tbody>
<tr><td>⬆️ 上边，`i == k`</td><td>`offset = j − k`</td></tr>
<tr><td>➡️ 右边，`j == n−1−k`</td><td>`offset = (len−1) + (i−k)`</td></tr>
<tr><td>⬇️ 下边，`i == n−1−k`</td><td>`offset = 2(len−1) + (n−1−k−j)`</td></tr>
<tr><td>⬅️ 左边</td><td>`offset = 3(len−1) + (n−1−k−i)`</td></tr>
</tbody></table>

### 第四步：映射到乐器编号

```
全局位置（1-indexed） = 外层元素数 + 圈内偏移 + 1
乐器编号 = (全局位置 − 1) % 9 + 1
```

---

## 举例验证

以 `num = 4`，位置 `(1, 2)` 为例（示例 2）：

- `k = min(1, 2, 2, 1) = 1`（第 2 圈，内层 `2 × 2`）
- 外圈元素数 = `4² − (4−2)² = 16 − 4 = 12`
- 在第 1 圈内，`i == k`（上边），`offset = 2 − 1 = 1`
- 全局位置 = `12 + 1 + 1 = 14`
- 乐器编号 = `(14 − 1) % 9 + 1 = 5` ✅

---

## 代码实现

```java
class Solution {
    public int orchestraLayout(int num, int Xpos, int Ypos) {
        long n = num;
        long i = Xpos;
        long j = Ypos;

        long k = Math.min(Math.min(i, j), Math.min(n - 1 - i, n - 1 - j));
        long outer = n * n - (n - 2 * k) * (n - 2 * k);
        long len = n - 2 * k;
        long offset;

        if (i == k) {
            offset = j - k;
        } else if (j == n - 1 - k) {
            offset = (len - 1) + (i - k);
        } else if (i == n - 1 - k) {
            offset = 2 * (len - 1) + (n - 1 - k - j);
        } else {
            offset = 3 * (len - 1) + (n - 1 - k - i);
        }

        long pos = outer + offset + 1;
        return (int) ((pos - 1) % 9 + 1);
    }
}
```

---

## 要点总结

<table width="100%" style="display:table"><colgroup><col width="80"><col></colgroup><tbody>
<tr><td>💡 圈层定位</td><td>`k = min(i, j, n-1-i, n-1-j)` — 同时考虑四条边到中心的距离</td></tr>
<tr><td>💡 外圈公式</td><td>`n² − (n−2k)²` 比逐层累加更简洁，一行算出外层元素数</td></tr>
<tr><td>💡 防溢出</td><td>使用 `long` 类型，`n²` 在 `n = 10⁹` 时达到 `10¹⁸`，超出 `int` 范围</td></tr>
</tbody></table>

---

## 复杂度

<table width="100%" style="display:table"><colgroup><col width="70"><col></colgroup><tbody>
<tr><td>⏱ 时间</td><td>O(1)</td></tr>
<tr><td>📦 空间</td><td>O(1)</td></tr>
</tbody></table>