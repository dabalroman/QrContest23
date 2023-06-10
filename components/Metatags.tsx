import Head from 'next/head';

export default function Metatags({
    title = 'QrContest - Fantasmagoria 13',
    description = 'QrContest - Fantasmagoria 13',
    image = 'https://fireship.io/courses/react-next-firebase/img/featured.png',
}) {
    return (
        <Head>
            <title>{title}</title>

            <meta name="description" content={description}/>

            <meta name="twitter:card" content="summary" />
            <meta name="twitter:site" content="@fireship_dev" />
            <meta name="twitter:title" content={title} />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:image" content={image} />

            <meta property="og:title" content={title} />
            <meta property="og:description" content={description} />
            <meta property="og:image" content={image} />
        </Head>
    );
}
