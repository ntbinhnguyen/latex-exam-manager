"use client";

import React from "react";
import { QuestionBankDashboard } from "@/components/question-bank";
import { useQuestionBank } from "@/lib/use-question-bank";
import { downloadBlob, downloadText } from "@/lib/download";
import { buildTex } from "@/lib/matrix-io";

export default function QuestionsPage() {
  const bank = useQuestionBank();

  const handleExport = async (format: string, selectedIds: string[]) => {
    const list = selectedIds.map((id) => bank.questionMap.get(id)).filter((q) => q !== undefined);
    if (format === "latex") {
      downloadText(buildTex(list, { name: "Ngân hàng câu hỏi", solutions: true }), `ngan-hang-cau-hoi-${Date.now()}.tex`);
    } else if (format === "excel") {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(
        list.map((q, i) => ({
          "STT": i + 1,
          "Mã câu hỏi": q.code,
          "Kiểu": q.type,
          "Mức độ": q.level ?? "",
          "Đề bài": q.content,
        })),
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Câu hỏi");
      const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
      downloadBlob(new Blob([buf]), `ngan-hang-cau-hoi-${Date.now()}.xlsx`);
    }
  };

  return (
    <div className="w-full">
      <QuestionBankDashboard
        questions={bank.questions}
        treeData={bank.tree}
        treeSource={bank.treeSource}
        treeWarnings={bank.treeWarnings}
        dataSource={bank.source}
        treeMode={bank.treeMode}
        hasManualTree={bank.hasManualTree}
        onTreeModeChange={bank.setTreeMode}
        onReloadTree={bank.reloadAutoTree}
        onLoadTreeFile={bank.loadTreeFile}
        onResetTree={bank.resetTree}
        onSaveContent={(id, raw) => bank.updateQuestion(id, { raw })}
        onSaveId={(id, code) => bank.updateQuestion(id, { code })}
        onDeleteQuestion={bank.deleteQuestion}
        onExportAction={handleExport}
      />
    </div>
  );
}
