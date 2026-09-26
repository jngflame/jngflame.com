const externalLink =
  "underline decoration-2 underline-offset-2 hover:opacity-60 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black";

function App() {
  return (
    <div className="min-h-dvh bg-white text-black">
      <div className="mx-auto w-full max-w-140 px-8">
        <header className="py-5">
          <h1 className="text-3xl font-bold">
            Inhwa Jang
          </h1>
        </header>

        <main className="flex max-w-78.75 flex-col gap-8 pb-12 sm:max-w-135 sm:gap-10 lg:max-w-170 lg:gap-12">
          <p className="text-xl">
            To inspire with extraordinary insight and a rich soul.
          </p>

          <section aria-labelledby="ex-heading">
            <h2
              id="ex-heading"
              className="text-2xl font-bold"
            >
              Ex
            </h2>
            <p className="mt-2 text-xl">
              <a
                className={externalLink}
                href="https://horang.it/"
                target="_blank"
                rel="noreferrer"
              >
                horang.it
              </a>{" "}
              (2024-2026)
            </p>
          </section>

          <section aria-labelledby="projects-heading">
            <h2
              id="projects-heading"
              className="text-2xl font-bold"
            >
              Projects
            </h2>
            <p className="mt-2 text-xl">
              <a
                className={externalLink}
                href="https://apps.apple.com/us/app/%EB%94%94%EB%AF%B8%ED%8E%98%EC%9D%B4/id1642292289"
                target="_blank"
                rel="noreferrer"
              >
                dimipay
              </a>{" "}
              (2022-2024)
            </p>
          </section>

          <section aria-labelledby="contact-heading">
            <h2
              id="contact-heading"
              className="text-2xl font-bold"
            >
              Call Me If You Get Lost..
            </h2>
            <div className="mt-2 flex flex-col gap-2 text-xl">
              <a className={externalLink} href="mailto:jngflame@gmail.com">
                jngflame@gmail.com
              </a>
              <a
                className={externalLink}
                href="https://github.com/jngflame"
                target="_blank"
                rel="noreferrer"
              >
                github
              </a>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
