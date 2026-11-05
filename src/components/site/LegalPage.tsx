import fs from "node:fs";
import path from "node:path";
import { Markdown } from "./Markdown";

/** Privacy and Terms: the Markdown in docs/legal, read when the page is built. */
export function LegalPage({ file }: { file: string }) {
  const source = fs.readFileSync(path.join(process.cwd(), "docs/legal", file), "utf8");
  return (
    <div className="px-4 py-12 sm:px-6 md:py-16">
      <article className="mx-auto max-w-3xl">
        <Markdown source={source} />
      </article>
    </div>
  );
}
