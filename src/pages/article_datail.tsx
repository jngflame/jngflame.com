import { useTranslation } from "react-i18next";
import { Link, linkStyle } from "../components/Link";
import { jordanArticle } from "../data/articles";

export function ArticleDetail() {
  const { t, i18n } = useTranslation();
  return (
    <main id="content" className="mx-auto w-full max-w-170 px-6 pt-6 pb-13.5">
      <Link
        href="/articles#content"
        className={`font-orbiter leading-6 text-black/30 underline underline-offset-2 ${linkStyle}`}
      >
        {t("navigation.back")}
      </Link>
      <article lang="ko" className="font-reading">
        <h1 className="mt-6 text-2xl leading-9 font-semibold">
          이집트에서 요르단으로
        </h1>
        <p
          lang={i18n.resolvedLanguage}
          className="mt-3 font-orbiter text-sm leading-5.25 text-black/30"
        >
          {t("article.metadata", { months: 3, minutes: 12 })}
        </p>
        <div className="mt-8 text-justify text-base md:text-lg leading-[1.8] md:leading-loose text-black/80">
          {jordanArticle.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </article>
    </main>
  );
}
