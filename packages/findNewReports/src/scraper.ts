import { Browser, Page } from 'puppeteer-core';
import chromium from 'chrome-aws-lambda';

export interface IScrapedReport {
    url: string;
    href: string;
    date: Date;
    first_name: string;
    last_name: string;
    imageHrefs: string[];
    questions: Array<{ label: string; answer: string }>;
}

export interface IScraper {
    scrapeReportsList(): Promise<string[]>;
    scrapeReport(href: string): Promise<IScrapedReport>;
    downloadImage(href: string): Promise<Buffer>;
    start(): Promise<void>;
    stop(): Promise<void>;
}

const USERNAME_SELECTOR = '#edit-name';
const PASSWORD_SELECTOR = '#edit-pass';
const CTA_SELECTOR = '#edit-submit';

export class Scraper implements IScraper {
    private browser: Browser;
    private page: Page;
    constructor(
        private readonly username: string,
        private readonly password: string,
        private readonly domain: string,
    ) {}
    async scrapeReportsList(): Promise<string[]> {
        const reports = (
            await this.page.evaluate(() =>
                Array.from(
                    document.querySelectorAll('.view-parent-daily-reports .views-field-view-node a'),
                    (element) => element.getAttribute('href'),
                ),
            )
        ).filter((r) => r.startsWith('/node'));

        console.info(`Found ${reports.length} reports listed`);

        return reports;
    }

    async scrapeReport(reportHref: string): Promise<IScrapedReport> {
        const href = `${this.domain}${reportHref}`;
        await this.page.goto(href);

        const nameTitle = await this.page.evaluate(() =>
            Array.from(document.querySelectorAll('.field--name-title'), (element) => element.textContent),
        );
        const [firstName, lastName] = nameTitle?.[0]?.split(' ');

        const labels = await this.page.evaluate(() =>
            Array.from(document.querySelectorAll('.node .field>div:nth-child(1)'), (element: any) => element.innerText),
        );
        const answers = await this.page.evaluate(() =>
            Array.from(document.querySelectorAll('.node .field>div:nth-child(2)'), (element: any) => element.innerText),
        );

        const dateText = await this.page.evaluate(
            () => (document.querySelector('.node .field--name-field-date>div:nth-child(2)') as any)?.innerText,
        );

        const imageHrefs = await this.page.evaluate(() => {
            return Array.from(document.querySelectorAll('.student_pictures a'), (element) =>
                element.getAttribute('href'),
            );
        });

        const questions = labels.reduce((qs, label, idx) => {
            const answer = answers?.[idx]?.trim();
            return [...qs, { label, answer }];
        }, []);

        const report: IScrapedReport = {
            url: href,
            date: new Date(dateText),
            href: reportHref,
            first_name: firstName,
            last_name: lastName,
            questions,
            imageHrefs,
        };

        return report;
    }

    async downloadImage(href: string): Promise<Buffer> {
        const viewSource = await this.page.goto(`${this.domain}${href}`);
        return viewSource.buffer();
    }

    async start(): Promise<void> {
        const browser = await chromium.puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });
        this.browser = browser;
        this.page = page;
        console.info('Headless browser started');
        await this.login();
    }

    async stop(): Promise<void> {
        console.info('Closing browser');
        await this.browser.close();
    }

    private async login(): Promise<void> {
        await this.page.goto(`${this.domain}/user/login`);
        await this.page.click(USERNAME_SELECTOR);
        await this.page.keyboard.type(this.username);
        await this.page.click(PASSWORD_SELECTOR);
        await this.page.keyboard.type(this.password);
        await this.page.click(CTA_SELECTOR);
        try {
            await this.page.waitForNavigation({ timeout: 5000 });
        } catch {
            console.warn('Waiting for navigation after login failed, this is typically safe to ignore.');
        }
        console.info('Logged into LSP');
    }
}
