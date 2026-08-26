import Header from "./components/Header";
import Hero from "./components/Hero";
import Problem from "./components/Problem";
import HowItWorks from "./components/HowItWorks";
import Features from "./components/Features";
import TrustStats from "./components/TrustStats";
import FinalCta from "./components/FinalCta";
import Footer from "./components/Footer";
import ProvaApp from "./ProvaApp";

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-1 bg-white dark:bg-neutral-950">
        <Hero />
        <Problem />
        <HowItWorks />

        <section
          id="app"
          className="border-y border-neutral-200 bg-neutral-50 py-24 dark:border-neutral-800 dark:bg-neutral-950"
        >
          <div className="mx-auto max-w-4xl px-6">
            <div className="mb-12 text-center">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Live product
              </span>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl dark:text-white">
                This is a real, working app
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-neutral-600 dark:text-neutral-400">
                Four live campaigns, real mainnet transactions, a gas-sponsored claim from any
                wallet. Try it below, no setup required.
              </p>
            </div>
            <ProvaApp />
          </div>
        </section>

        <Features />
        <TrustStats />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
