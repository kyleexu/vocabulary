import { FormEvent, useState } from "react";
import { loginWithKey } from "../lib/auth";

type Props = {
  onSuccess: () => void;
};

export function Login({ onSuccess }: Props) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (loginWithKey(key)) {
      setError("");
      onSuccess();
      return;
    }
    setError("密钥不正确");
  };

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <h1>Vocabulary Trainer</h1>
        <p className="login-hint">请输入访问密钥</p>
        <label className="login-label" htmlFor="access-key">
          密钥
        </label>
        <input
          id="access-key"
          className="login-input"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          autoFocus
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            if (error) setError("");
          }}
          placeholder="输入密钥"
        />
        {error ? <p className="login-error">{error}</p> : null}
        <button type="submit" className="login-submit">
          进入
        </button>
      </form>
    </div>
  );
}
