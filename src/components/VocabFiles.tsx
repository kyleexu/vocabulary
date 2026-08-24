import { useEffect, useState } from "react";
import { listVocabularyFiles } from "../lib/storage";

type Props = {
  currentFile: string;
  wordCount: number;
  switching: boolean;
  onSelect: (file: string) => void;
  onBack: () => void;
};

export function VocabFiles({
  currentFile,
  wordCount,
  switching,
  onSelect,
  onBack,
}: Props) {
  const [files, setFiles] = useState<string[]>([currentFile]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        setFiles(await listVocabularyFiles());
      } catch (err) {
        setMessage(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>词库文件</h2>
        <button className="btn ghost" onClick={onBack}>
          返回
        </button>
      </div>

      <p className="muted">
        当前使用 <strong>{currentFile}</strong>，共 {wordCount} 词。选择后会记住，下次打开仍用这个文件。
      </p>
      <p className="faint">把 JSON 放到 <code>data/</code> 目录后刷新即可出现在下方。</p>

      {message && <p className="muted">{message}</p>}

      {switching && <p className="muted">正在切换词库…</p>}

      <div className="tabs" role="tablist" aria-label="词库文件">
        {files.map((file) => (
          <button
            key={file}
            type="button"
            role="tab"
            aria-selected={file === currentFile}
            className={`chip ${file === currentFile ? "on" : ""}`}
            disabled={switching}
            onClick={() => {
              if (file !== currentFile) onSelect(file);
            }}
          >
            {file}
          </button>
        ))}
      </div>
    </div>
  );
}
