# Passage format (模板级规则 ③)

The learner sees ONE markdown block in chat. There is no output file. Structure:

```markdown
# <English title, A2-simple>

<250–350 words, news style: short paragraphs, facts, one quoted line.
Every target word appears ≥2 times; first appearance inside **bold**.
Reunion words appear plain (no bold, no annotation) at least once each.>

### 生词 · 只给语境义
| 词 | 在这篇里 |
|---|---|
| **service** | n. 公共交通系统（不是泛指的「服务」）|

### 重逢词（Anki 旧词，本篇各见 N 面）
- **schedule** — updates the *schedule*「更新时刻表」

### 理解题（默认 3 道，选择题，可 --no-quiz 关闭）
1. Why was the train late? — A. rain  B. a broken train  C. too many passengers
```

Rules that are format, not script-checked:

- 生词注释只给「词性 + 本篇语境义」一行，不整句翻译，不给词典全义（注意假说：焦点是「这个词在这里是什么意思」）。
- 理解题考大意不考词义记忆，题目本身也必须是 A2 用词；正确答案位置随机。
- 重逢词在正文里必须语法自然——一个都塞不进就少声明几个，禁止为复现造怪句。
- 文末可加一行 metrics（词数/生词率/句长），来自 passage-check 输出。

Script-checked rules (硬校验，见 passage-check.mjs)：篇长、句长（最长≤20、均≤12）、
目标词 4–6 个各≥2 次、纲外 token 率≤4%、未申报纲外词=0、目标词加粗（warn 级）。
