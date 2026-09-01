"use client";

import { useRef, type ChangeEvent } from "react";
import { REFERENCE_FILE_ACCEPT } from "./reference-upload";

export type MaterialUploadState = { loading: boolean; message: string; warning: boolean };

export function FileUploadButton({ onChange, loading = false, disabled = false, label = "上传文件", ariaLabel = label }: {
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  ariaLabel?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return <>
    <input ref={input} type="file" multiple accept={REFERENCE_FILE_ACCEPT} onChange={onChange} disabled={disabled || loading} hidden aria-label={ariaLabel} />
    <button type="button" className={`material-upload-button ${loading ? "loading" : ""}`} disabled={disabled || loading} onClick={() => input.current?.click()} aria-label={loading ? "正在解析文件" : ariaLabel} aria-busy={loading}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21.4 11.6-9.2 9.2a6 6 0 0 1-8.5-8.5l10-10a4 4 0 0 1 5.6 5.7l-10 10a2 2 0 0 1-2.8-2.8l9.2-9.2" /></svg>
      {loading ? "正在解析…" : label}
    </button>
  </>;
}

export function MaterialInput({ id, title, tag, description, placeholder, value, onChange, onUpload, upload, className, disabled = false }: {
  id: string; title: string; tag: string; description?: string; placeholder: string; value: string;
  onChange: (value: string) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  upload?: MaterialUploadState;
  className: string;
  disabled?: boolean;
}) {
  return <div className={`${className} material-input`}>
    <span id={`${id}-label`}><strong>{title}</strong><em>{tag}</em></span>
    {description && <small>{description}</small>}
    <textarea id={id} aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint`} value={value} maxLength={20_000} disabled={upload?.loading} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    <div className="material-input-footer">
      <FileUploadButton onChange={onUpload} loading={upload?.loading} disabled={disabled} ariaLabel={`为${title}上传文件`} />
      <small id={`${id}-hint`}>PDF / MD / 文本</small>
      <small className="material-input-count">{value.length.toLocaleString("en-US")} / 20,000</small>
    </div>
    {upload?.message && <p className={`material-input-status ${upload.warning ? "warning" : ""}`} role="status" aria-live="polite">{upload.message}</p>}
  </div>;
}
