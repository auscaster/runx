import { createHash } from "node:crypto";

import type { A2aTask, A2aTransport } from "../../adapters/a2a/src/index.js";

export function createA2aFixtureTransport(): A2aTransport {
  const tasks = new Map<string, A2aTask>();

  return {
    sendMessage: async (request) => {
      if (!request.agentCardUrl.startsWith("fixture://")) {
        throw new Error("A2A fixture transport only supports fixture:// agent cards.");
      }

      const taskId = `a2a_${hashString(JSON.stringify(request)).slice(0, 16)}`;
      const task =
        request.task === "fail"
          ? { id: taskId, status: "failed" as const, error: "fixture failure" }
          : { id: taskId, status: "completed" as const, output: request.message.message ?? request.message };
      tasks.set(taskId, task);
      return task;
    },
    getTask: async (request) => {
      const task = tasks.get(request.taskId);
      if (!task) {
        throw new Error("A2A fixture task not found.");
      }
      return task;
    },
    cancelTask: async (request) => {
      const task = { id: request.taskId, status: "canceled" as const };
      tasks.set(request.taskId, task);
      return task;
    },
  };
}

function hashString(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
