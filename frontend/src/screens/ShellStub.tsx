// Real content: /new → T-041, /join/:token → T-042, /trip/:id/settings → T-044.
import { t } from '../i18n/he';

export function ShellStub({ title }: { title: string }) {
  return (
    <div className="boot-screen">
      <h1>{title}</h1>
      <p>{t.shell.stub.comingSoon}</p>
    </div>
  );
}
