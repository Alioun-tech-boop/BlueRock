import Document, { Html, Head, Main, NextScript } from 'next/document'

export default class MyDocument extends Document {
  render() {
    return (
      <Html lang="fr">
        <Head>
          <meta name="theme-color" content="#0D162B" />
          <meta name="format-detection" content="telephone=no" />
          <link rel="icon" href="/logo.png" type="image/png" />
          <link rel="apple-touch-icon" href="/icon-192.png" />
          <link rel="manifest" href="/manifest.json" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}
