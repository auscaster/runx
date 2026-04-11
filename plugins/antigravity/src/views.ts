import { buildReceiptViewModel, type ReceiptViewModel } from "../../ide-core/src/index.js";

export interface IdeTreeItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
}

export function receiptTreeItems(receipt: unknown): readonly IdeTreeItem[] {
  return viewModelTreeItems(buildReceiptViewModel(receipt));
}

export function viewModelTreeItems(model: ReceiptViewModel): readonly IdeTreeItem[] {
  return model.nodes.map((node) => ({
    id: node.id,
    label: node.label,
    description: [node.kind, node.status].filter(Boolean).join(" "),
  }));
}
