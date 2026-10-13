import { QuestionItem } from "./types";

/** Dữ liệu mẫu – chỉ dùng khi chưa kết nối được backend. */
export const MOCK_QUESTIONS: QuestionItem[] = [
  // Page 1 (matches 12 visible cards in the screenshot)
  {
    id: "q-1",
    number: 1,
    code: "T0.TN.C1.B1.02",
    type: "Trắc nghiệm",
    level: 1,
    content: 'Cho mệnh đề chứa biến $P(x, y): "3x + 2y = 7"$. Đâu là mệnh đề đúng trong các mệnh đề dưới đây?',
    raw: String.raw`\begin{ex}%Câu 1
Cho mệnh đề chứa biến $P(x,y): "3x+2y=7"$. Đâu là mệnh đề đúng trong các mệnh đề dưới đây?
\choice
{$P(1,2)$}
{\True $P(1,2)$ vì $3\cdot 1+2\cdot 2=7$}
{$P(2,1)$}
{$P(3,0)$}
\loigiai{Thay $x=1$, $y=2$ vào ta được $3\cdot 1+2\cdot 2=7$ nên mệnh đề đúng.}
\end{ex}`,
  },
  {
    id: "q-4",
    number: 4,
    code: "T0.TN.C1.B1.02",
    type: "Trắc nghiệm",
    level: 1,
    content: "Các câu sau, câu nào **không** phải là mệnh đề chứa biến?",
  },
  {
    id: "q-5",
    number: 5,
    code: "T0.TN.C1.B1.02",
    type: "Trắc nghiệm",
    level: 1,
    content: "Trong các câu sau, câu nào **không** là một mệnh đề chứa biến?",
  },
  {
    id: "q-6",
    number: 6,
    code: "T0.TN.C1.B1.02",
    type: "Trắc nghiệm",
    level: 1,
    content: "Trong các câu sau đây, câu nào là mệnh đề chứa biến?",
  },
  {
    id: "q-8",
    number: 8,
    code: "T0.TN.C1.B1.02",
    type: "Trắc nghiệm",
    level: 1,
    content: "Phát biểu nào sau đây là mệnh đề chứa biến?",
  },
  {
    id: "q-10",
    number: 1,
    code: "T0.TN.C1.B1.02",
    type: "Trắc nghiệm",
    level: 1,
    content: "Phát biểu nào sau đây là một mệnh đề chứa biến?",
  },
  {
    id: "q-11",
    number: 11,
    code: "T0.TN.C1.B1.02",
    type: "Trắc nghiệm",
    level: 1,
    content: "Câu nào sau đây **không phải** là mệnh đề chứa biến?",
  },
  {
    id: "q-12",
    number: 12,
    code: "T0.TN.C1.B1.02",
    type: "Trắc nghiệm",
    level: 1,
    content: "Trong các câu sau, câu nào là mệnh đề chứa biến?",
  },
  {
    id: "q-13",
    number: 13,
    code: "T0.TN.C1.B1.02",
    type: "Trắc nghiệm",
    level: 1,
    content: "Trong các phát biểu sau, đâu không là mệnh đề chứa biến?",
  },
  {
    id: "q-16",
    number: 16,
    code: "T0.TN.C1.B1.02",
    type: "Trắc nghiệm",
    level: 2,
    content: "Trong các câu sau, câu nào là mệnh đề không chứa biến?",
  },
  {
    id: "q-17",
    number: 17,
    code: "T0.DS.C1.B1.02",
    type: "Đúng/Sai",
    level: 1,
    content: 'Cho mệnh đề chứa biến $P(x): "x > \\frac{1}{x}"$. Xét tính đúng sai của các khẳng định sau.',
    raw: String.raw`\begin{ex}%Câu 17
Cho mệnh đề chứa biến $P(x): "x > \dfrac{1}{x}"$. Xét tính đúng sai của các khẳng định sau.
\choiceTF
{\True $P(2)$ là mệnh đề đúng}
{$P(\dfrac12)$ là mệnh đề đúng}
{\True $P(-2)$ là mệnh đề đúng}
{$P(-\dfrac12)$ là mệnh đề sai}
\loigiai{Kiểm tra trực tiếp từng giá trị.}
\end{ex}`,
  },
  {
    id: "q-19",
    number: 19,
    code: "T0.TN.C1.B1.02",
    type: "Trắc nghiệm",
    level: 2,
    content: "Cho mệnh đề chứa biến $P(x): x^{2017} = 7$. Mệnh đề nào sau đây là đúng?",
    raw: String.raw`\begin{ex}%Câu 19
Cho mệnh đề chứa biến $P(x): x^{2017}=7$. Mệnh đề nào sau đây là đúng?
\choice
{$P(0)$}
{$P(1)$}
{\True $P\left(\sqrt[2017]{7}\right)$}
{$P(-1)$}
\loigiai{$x=\sqrt[2017]{7}$ thỏa $x^{2017}=7$.}
\end{ex}`,
  },

  // Remaining questions to complete the 36 questions in Dạng 2 (for Page 2 & filtering)
  {
    id: "q-20",
    number: 20,
    code: "T0.TN.C1.B1.02",
    type: "Trắc nghiệm",
    level: 2,
    content: "Cho mệnh đề chứa biến $P(n): \"n^2 + 1 \\text{ chia hết cho } 5\"$ với $n \\in \\mathbb{N}$. Tìm mệnh đề đúng.",
  },
  {
    id: "q-21",
    number: 21,
    code: "T0.TN.C1.B1.02",
    type: "Trắc nghiệm",
    level: 2,
    content: "Với giá trị thực nào của $x$ thì mệnh đề chứa biến $P(x): \"2x - 3 > 0\"$ là mệnh đề đúng?",
  },
  {
    id: "q-22",
    number: 22,
    code: "T0.TN.C1.B1.02",
    type: "Trắc nghiệm",
    level: 1,
    content: "Cho mệnh đề chứa biến $Q(x): \"x^2 - 4 = 0\"$. Giá trị $x = 2$ cho mệnh đề đúng hay sai?",
  },
  {
    id: "q-23",
    number: 23,
    code: "T0.TN.C1.B1.02",
    type: "Trắc nghiệm",
    level: 2,
    content: "Cho mệnh đề $P(x): \"x \\in \\mathbb{R}, x^2 - x + 1 > 0\"$. Khẳng định nào sau đây là khẳng định đúng?",
  },
  {
    id: "q-24",
    number: 24,
    code: "T0.DS.C1.B1.02",
    type: "Đúng/Sai",
    level: 2,
    content: "Cho mệnh đề chứa biến $P(x): \"|x| < 3\"$ với $x \\in \\mathbb{Z}$. Xét tính đúng sai của từng phát biểu.",
  },
  {
    id: "q-25",
    number: 25,
    code: "T0.TN.C1.B1.02",
    type: "Trắc nghiệm",
    level: 2,
    content: "Cho mệnh đề chứa biến $P(a, b): \"a + b \\ge 2\\sqrt{ab}\"$ với $a, b > 0$. Xác định chân trị của $P(1, 4)$.",
  },
  {
    id: "q-26",
    number: 26,
    code: "T0.TN.C1.B1.02",
    type: "Trắc nghiệm",
    level: 3,
    content: "Tìm tất cả các số nguyên $n$ để mệnh đề chứa biến $P(n): \"\\frac{2n+3}{n-1} \\in \\mathbb{Z}\"$ là mệnh đề đúng.",
  },
  {
    id: "q-27",
    number: 27,
    code: "T0.TN.C1.B1.02",
    type: "Trắc nghiệm",
    level: 3,
    content: "Cho tam giác $ABC$. Xét mệnh đề chứa biến $P(x): \"x^2 = AB^2 + AC^2 - 2AB \\cdot AC \\cos A\"$. Khi $x = BC$ mệnh đề có chân trị gì?",
  },
  {
    id: "q-28",
    number: 28,
    code: "T0.TN.C1.B1.02",
    type: "Trắc nghiệm",
    level: 4,
    content: "Cho đa thức $f(x) = x^4 - 2x^2 + m$. Tìm số giá trị nguyên của tham số $m \\in [-10; 10]$ để mệnh đề $\\forall x \\in \\mathbb{R}, f(x) \\ge 0$ đúng.",
  },
  {
    id: "q-29",
    number: 29,
    code: "T0.TN.C1.B1.02",
    type: "Trắc nghiệm",
    level: 4,
    content: "Cho mệnh đề $P(x, y): \"x^2 + y^2 - 4x - 6y + 13 \\le 0\"$. Tìm giá trị lớn nhất của biểu thức $T = 2x + 3y$.",
  },
  {
    id: "q-30",
    number: 30,
    code: "T0.TN.C1.B1.02",
    type: "Trắc nghiệm",
    level: 1,
    content: "Cho mệnh đề $P(x): \"x^2 - 5x + 6 = 0\"$. Với $x = 3$, khẳng định $P(3)$ là đúng hay sai?",
  },
  {
    id: "q-31",
    number: 31,
    code: "T0.TN.C1.B1.02",
    type: "Trắc nghiệm",
    level: 2,
    content: "Trong các khẳng định sau với mệnh đề chứa biến $P(x): \"x < \\sqrt{x}\"$, khẳng định nào sau đây đúng?",
  },
];
