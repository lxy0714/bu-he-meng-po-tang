// 独立版字段约束垫片。
//
// 托管版用 `@hatch/space-sdk/fields` 的 actionFields 宏，在构建期从
// 服务端 zod schema 把每个请求字段的输入约束（name / maxLength）展开
// 成字面量对象，例如 createCharacter.name 展开为
// { name: "name", maxLength: 12 }。独立版没有宏系统，这里按当前
// schema 手工给出同等展开结果，仅供 Creation / ReincarnationPanel /
// SettingsPage 三处已用到的字段。
//
// 服务端始终以 zod schema 为准（超限请求会被拒）；本文件只决定输入
// 框的 maxLength。改服务端字段上限时，记得同步改这里。
type FieldAttrs = { name: string; maxLength: number };

export type FieldsTree = {
  createCharacter: { name: FieldAttrs };
  reincarnate: { name: FieldAttrs };
  aiTestConnection: { apiKey: FieldAttrs; baseUrl: FieldAttrs; model: FieldAttrs };
};

const FIELDS: FieldsTree = {
  createCharacter: {
    name: { name: "name", maxLength: 12 },
  },
  reincarnate: {
    name: { name: "name", maxLength: 12 },
  },
  aiTestConnection: {
    apiKey: { name: "apiKey", maxLength: 512 },
    baseUrl: { name: "baseUrl", maxLength: 300 },
    model: { name: "model", maxLength: 160 },
  },
};

// 调用点写作 actionFields<typeof Actions>()，与托管版宏的签名对齐；
// 独立版忽略类型参数，直接返回上面这棵手工展开的字段树。
export function actionFields<T>(): FieldsTree {
  void (0 as unknown as T);
  return FIELDS;
}
