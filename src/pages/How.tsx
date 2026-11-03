const STEPS = [
  { t: 'Launch the coin', d: 'Pick a name, ticker, picture and socials. Your coin starts on a Meteora bonding curve, so anyone can trade it right away. Add an optional dev buy and it happens in the same transaction that creates the coin, so nobody can buy before you.' },
  { t: 'Describe 40 characters', d: 'Give a theme, an art style and 2 to 5 trait lists, like Species, Hat, Item and Mood. Collect combines them into 40 different characters, no two alike, and shows you all 40 before you launch.' },
  { t: 'The pictures get drawn', d: 'After launch, Collect draws all 40 characters. Your coin page fills in as each one finishes, and claiming opens once all 40 are ready.' },
  { t: 'Holders claim one', d: 'Hold the coin\'s minimum (set by the creator, 0.05% to 1% of the supply) in a normal wallet for about two minutes. Collect picks a random unclaimed character and sends it to your wallet as an NFT. One per wallet, earliest first.' },
  { t: 'It is yours', d: 'The NFT stays in your wallet even if you sell the coin, and you can trade it like any other NFT. Only 40 exist, so every character has exactly one owner.' },
  { t: 'The curve fills, the coin graduates', d: 'Once enough SOL has been bought, the coin moves to a DEX pool and its liquidity is locked for good, so nobody can pull it.' },
];

export function How() {
  return (
    <section className="narrow">
      <div className="label"><b>00</b> How it works</div>
      <h1><span className="neon">Launch a coin.</span><br /><span className="alt">Hand out 40 collectibles.</span></h1>
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s.t} className="card"><span className="stepno">{String(i + 1).padStart(2, '0')}</span><div><h3>{s.t}</h3><p>{s.d}</p></div></li>
        ))}
      </ol>
      <h2>Good to know</h2>
      <ul className="dim">
        <li>The creator pays the network fees. Trading fees from the curve go to Collect and, if the config says so, the creator.</li>
        <li>Someone can use several wallets to claim several characters. Program-owned accounts such as DEX pools never qualify.</li>
        <li>Coins are risky and can lose all their value. Nothing here is financial advice.</li>
      </ul>
      <a className="btn primary" href="#/create">Launch a coin</a>
    </section>
  );
}
