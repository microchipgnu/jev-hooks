import {
  createJevClient,
  MockJudgmentAdapter,
  useChoice,
} from "jev-hooks/react";
export { useChoice };
export const client = createJevClient({ adapter: new MockJudgmentAdapter() });
