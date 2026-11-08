---
date: '2026-11-08'
draft: false
title: '双周赛 195-2. 按类型和颜色移除元素'
categories: ['算法']
tags: ['LeetCode', '栈', '贪心']
---

## 题目信息

<table width="100%" style="display:table"><colgroup><col width="70"><col></colgroup><tbody>
<tr><td>🔗 链接</td><td><a href="https://leetcode.cn/problems/remove-elements-by-type-and-color/description/">LeetCode 双周赛 195-2</a></td></tr>
<tr><td>🏷 难度</td><td><strong>中等</strong></td></tr>
<tr><td>📌 标签</td><td>栈 · 贪心</td></tr>
</tbody></table>

---

## 题目描述

给定三个数组 `types`、`colors` 和 `groupSize`，其中 `types` 和 `colors` 长度为 `n`，`groupSize` 长度为 `m`。

在一次操作中，如果**恰好** `groupSize[t]` 个**连续**元素都具有类型 `t` 且颜色**相同**，你可以将它们移除。移除后，剩余元素重新相邻，保持相对顺序。

> 如果可以通过一系列有效操作移除所有元素，返回 `true`，否则返回 `false`。

---

## 思路分析

核心思想：用一个栈维护"压缩后"的元素序列，栈中每项记录 `[type, color, count]`。遍历过程中不断尝试从栈顶消除完整的组。

### 为什么用栈

移除一组元素后，两端的剩余元素会"合拢"到一起——这正是栈的行为：弹出中间项，栈顶自然暴露下一项。无需真正模拟数组的删除和移位。

### 算法步骤

**① 入栈合并**：遍历每个元素 `(type, color)`：
- 若栈顶的 `type`、`color` 与当前元素一致 → 栈顶 `count += 1`
- 否则 → 压入新项 `[type, color, 1]`

**② 尝试消除**：检查栈顶，若 `count >= groupSize[type]`，说明栈顶可以构成至少一组删除操作：
- `count -= groupSize[type]`
- 若 `count == 0`，弹出该项，**继续检查新栈顶**（因为刚刚弹出的那组可能挡在两组同类同色元素之间）

**③ 最终判定**：遍历结束后栈为空 → `true`，否则 → `false`。

### 举例推导

`types = [0,1,1,0]`，`colors = [5,3,3,5]`，`groupSize = [2,2]`：

<table width="100%" style="display:table"><colgroup><col width="80"><col width="100"><col width="120"><col></colgroup><tbody>
<tr><td>i</td><td>(type,color)</td><td>栈（底→顶）</td><td>操作</td></tr>
<tr><td>0</td><td>(0, 5)</td><td>[(0,5,1)]</td><td>压入</td></tr>
<tr><td>1</td><td>(1, 3)</td><td>[(0,5,1), (1,3,1)]</td><td>type/color 不同，压入</td></tr>
<tr><td>2</td><td>(1, 3)</td><td>[(0,5,1), (1,3,2)]</td><td>同 type+color，合并 count=2</td></tr>
<tr><td></td><td></td><td>[(0,5,1)]</td><td>2 ≥ groupSize[1]=2，消除后弹出</td></tr>
<tr><td>3</td><td>(0, 5)</td><td>[(0,5,2)]</td><td>同 type+color，合并 count=2</td></tr>
<tr><td></td><td></td><td>[]</td><td>2 ≥ groupSize[0]=2，消除后弹出</td></tr>
</tbody></table>

> 栈空 → `true`

再看一个**消除后暴露新组**的场景：

`types = [0,0,0,0]`，`colors = [1,1,1,1]`，`groupSize = [2]`：

<table width="100%" style="display:table"><colgroup><col width="80"><col width="100"><col width="120"><col></colgroup><tbody>
<tr><td>i</td><td>(type,color)</td><td>栈（底→顶）</td><td>操作</td></tr>
<tr><td>0</td><td>(0, 1)</td><td>[(0,1,1)]</td><td>压入</td></tr>
<tr><td>1</td><td>(0, 1)</td><td>[(0,1,2)]</td><td>合并</td></tr>
<tr><td></td><td></td><td>[]</td><td>2 ≥ 2，消除弹出，while 继续但栈空</td></tr>
<tr><td>2</td><td>(0, 1)</td><td>[(0,1,1)]</td><td>压入</td></tr>
<tr><td>3</td><td>(0, 1)</td><td>[(0,1,2)]</td><td>合并</td></tr>
<tr><td></td><td></td><td>[]</td><td>2 ≥ 2，消除弹出</td></tr>
</tbody></table>

> 栈空 → `true`。注意这里分两轮消除，因为第一组消除后第二组才"凑齐"。

---

## 代码实现

```java
class Solution {
    public boolean canRemoveAll(int[] types, int[] colors, int[] groupSize) {
        Deque<int[]> q = new ArrayDeque<>();

        for (int i = 0; i < types.length; i++) {
            int type = types[i];
            int color = colors[i];

            if (q.isEmpty() || q.peekLast()[0] != type || q.peekLast()[1] != color) {
                q.addLast(new int[]{type, color, 1});
            } else {
                q.peekLast()[2]++;
            }

            while (!q.isEmpty()) {
                int[] t = q.peekLast();
                if (t[2] >= groupSize[t[0]]) {
                    t[2] -= groupSize[t[0]];
                    if (t[2] == 0) q.removeLast();
                } else {
                    break;
                }
            }
        }

        return q.isEmpty();
    }
}
```

---

## 要点总结

<table width="100%" style="display:table"><colgroup><col width="80"><col></colgroup><tbody>
<tr><td>💡 栈模拟闭合</td><td>移除一组元素后两端合拢，栈的弹出机制天然模拟了这一行为，无需数组移位</td></tr>
<tr><td>💡 while 连续消除</td><td>弹出一组后必须继续检查新栈顶——被消除的组可能挡在两组同类同色元素之间</td></tr>
<tr><td>💡 贪心正确性</td><td>每次遇到可消除的组立即消除不会使结果变差，因为操作不改变其他元素的可消除性</td></tr>
</tbody></table>

---

## 复杂度

<table width="100%" style="display:table"><colgroup><col width="70"><col></colgroup><tbody>
<tr><td>⏱ 时间</td><td>O(n)</td></tr>
<tr><td>📦 空间</td><td>O(n)</td></tr>
</tbody></table>