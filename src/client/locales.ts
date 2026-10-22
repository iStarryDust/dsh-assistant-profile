/**
 * 词典：助理档案页与侧栏入口的文案。
 *
 * 只放界面文案——人格、风格、语言是用户自己的内容，不进词典。
 */

/** 中文词典（键的来源）。 */
export const zh = {
  'panel': '助理档案',
  'title': '助理档案',
  'intro': '这份人格会出现在每个新会话的系统提示最前面，标准 / PTC / 极简 / 创造四个模式通用。',
  'name.label': '名称',
  'name.placeholder': '例如：大肥鱼',
  'name.hint': '侧栏「新会话」上方显示它，也会作为「你的名字是…」进入提示词。',
  'style.label': '风格',
  'style.placeholder': '例如：冷静、精确，先给结论再给理由',
  'style.hint': '一句话的说话方式，会作为 Style 一行加在人格前面。',
  'language.label': '语言',
  'language.placeholder': '例如：简体中文',
  'language.hint': '模型跟你说话用的语言。',
  'language.quick.zh': '中文',
  'language.quick.en': 'English',
  'persona.label': '人格提示词',
  'persona.placeholder': '写下它是谁、怎么做事、在意什么。留空就用原生 DSH 的身份句。',
  'persona.hint': '原样放在系统提示最前面，四个模式都从这段开始。',
  'persona.unit': '字',
  'persona.long': '偏长，会挤占上下文',
  'save': '保存',
  'saving': '保存中…',
  'saved': '已保存',
  'dirty': '有未保存的改动',
  'reset': '撤销改动',
  'failed': '保存失败',
  'unavailable': '设置通道还没就绪，稍后再试。',
  'readonly': '当前 profile 不可写。',
} as const

/** 词典键。 */
export type ProfileKey = keyof typeof zh

/** 英文词典：与中文键一一对应。 */
export const en: Record<ProfileKey, string> = {
  'panel': 'Assistant Profile',
  'title': 'Assistant Profile',
  'intro': 'This persona opens every new session: it rides the very top of the system prompt and applies to all four modes.',
  'name.label': 'Name',
  'name.placeholder': 'e.g. Big Fat Fish',
  'name.hint': 'Shown above New Session in the sidebar, and injected as "Your name is …".',
  'style.label': 'Style',
  'style.placeholder': 'e.g. calm and precise; conclusion first',
  'style.hint': 'One line about how it talks. Added as a Style line before the persona.',
  'language.label': 'Language',
  'language.placeholder': 'e.g. Simplified Chinese',
  'language.hint': 'The language it replies in.',
  'language.quick.zh': '中文',
  'language.quick.en': 'English',
  'persona.label': 'Persona prompt',
  'persona.placeholder': 'Who it is, how it works, what it cares about. Leave empty to keep the native DSH identity.',
  'persona.hint': 'Injected verbatim at the top of the system prompt, in every mode.',
  'persona.unit': 'chars',
  'persona.long': 'Long; it will eat into the context',
  'save': 'Save',
  'saving': 'Saving…',
  'saved': 'Saved',
  'dirty': 'Unsaved changes',
  'reset': 'Discard',
  'failed': 'Save failed',
  'unavailable': 'The settings channel is not ready yet; try again in a moment.',
  'readonly': 'This profile is read-only.',
}
