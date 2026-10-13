"use client";

import React from "react";
import { Modal } from "@/components/question-bank/Modal";
import { SidebarTree } from "@/components/question-bank/SidebarTree";
import type { TreeNode } from "@/components/question-bank/types";

interface Props {
  tree: TreeNode[];
  currentId: string | null;
  onPick: (id: string | null) => void;
  onClose: () => void;
}

export const TopicPickerModal: React.FC<Props> = ({ tree, currentId, onPick, onClose }) => (
  <Modal
    title="Chọn dạng bài"
    widthClass="max-w-xl"
    onClose={onClose}
    footer={
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">Chọn một mục: toàn bộ câu hỏi của mục đó và các mục con sẽ được dùng. Chọn một Dạng thì Mức độ tự điền theo Dạng và bị khóa.</span>
        <button
          type="button"
          onClick={() => onPick(null)}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50"
        >
          Bỏ chọn dạng bài
        </button>
      </div>
    }
  >
    <SidebarTree
      readOnly
      treeData={tree}
      selectedFolderId={currentId ?? "all"}
      onSelectFolder={(id) => onPick(id === "all" ? null : id)}
      maxHeightClass="max-h-[50vh]"
    />
  </Modal>
);