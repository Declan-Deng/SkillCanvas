"use client";

export type SkillFileExplanation = {
  kind: string;
  summary: string;
  contents: string[];
  usedWhen: string;
  affects: string;
  related: string[];
  validation: string;
};

type WorkspaceProps = {
  files: Record<string, string>;
  skillName: string;
  selectedFile: string;
  onSelectFile: (path: string) => void;
  explanation: SkillFileExplanation;
  sourceCount: number;
  dimensionCount: number;
  blockerCount: number;
} & ({ readOnly: true; onContentChange?: never } | { readOnly?: false; onContentChange: (value: string) => void });

/** One visual workspace for generation and release; release only changes the
 * editing affordance, never the files, selection or explanation contract. */
export function SkillFileWorkspace(props: WorkspaceProps) {
  const { files, skillName, selectedFile, onSelectFile, explanation, sourceCount, dimensionCount, blockerCount } = props;
  return (
    <div className="editor-shell skill-file-workspace" role="region" aria-label="Skill 文件工作区">
      <nav className="file-tree" aria-label="Skill 文件列表">
        <div className="tree-heading">{skillName.toUpperCase()}</div>
        {Object.keys(files).map((name) => (
          <button type="button" className={selectedFile === name ? "selected" : ""} key={name} title={name} aria-pressed={selectedFile === name} onClick={() => onSelectFile(name)}>
            <span aria-hidden="true">{name.endsWith(".md") ? "M↓" : name.endsWith(".json") ? "{}" : name.endsWith(".py") ? ">_" : name.startsWith("assets/") ? "A" : "◇"}</span>{name}
          </button>
        ))}
        <div className="tree-note"><strong>{Object.keys(files).length} 个文件</strong><span>按需加载，节省上下文</span></div>
      </nav>
      <div className="code-pane">
        <div className="code-tab"><span title={selectedFile}>{selectedFile}</span><span className="valid-mark">{props.readOnly ? "只读预览 · 修改请返回编辑" : "可编辑 · 本标签页自动保存"}</span></div>
        <textarea
          key={selectedFile}
          className="skill-file-editor"
          value={files[selectedFile] || ""}
          readOnly={props.readOnly === true}
          onChange={props.readOnly ? undefined : (event) => props.onContentChange(event.target.value)}
          aria-label={`${props.readOnly ? "查看" : "编辑"} ${selectedFile}`}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
      <div className="inspector-pane">
        <div className="inspector-title"><span>文件解释</span><small>{explanation.kind}</small></div>
        <div className="inspector-callout"><span>这个文件负责什么？</span><p>{explanation.summary}</p></div>
        <section className="inspector-detail-section">
          <strong>里面具体有什么</strong>
          <ul>{explanation.contents.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
        <section className="inspector-detail-grid">
          <div><span>什么时候会用</span><p>{explanation.usedWhen}</p></div>
          <div><span>改了会影响什么</span><p>{explanation.affects}</p></div>
          <div><span>怎么检查它</span><p>{explanation.validation}</p></div>
          <div><span>关联文件</span><p>{explanation.related.length ? explanation.related.join("、") : "当前没有检测到直接文件引用"}</p></div>
        </section>
        <div className="inspector-stat"><span>预计上下文</span><strong>{Math.ceil((files[selectedFile]?.length || 0) / 4)} tokens</strong></div>
        <div className="inspector-stat"><span>理解来源</span><strong>{sourceCount} 份资料 · {dimensionCount} 个需求维度</strong></div>
        <div className="inspector-stat"><span>发布前检查</span><strong className={blockerCount ? "red-text" : "green-text"}>{blockerCount ? `${blockerCount} 项待修复` : "已通过"}</strong></div>
      </div>
    </div>
  );
}
