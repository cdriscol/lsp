import { DocumentClient } from 'aws-sdk/clients/dynamodb';
import { conversation } from '@assistant/conversation';
import listify from 'listify';
import moment from 'moment';
import { formatReportKey } from '@lsp/common';

const documentClient = new DocumentClient();

const app = conversation();
const DATE_FORMAT = 'dddd MMMM Do';

app.handle('readReportFunc', async (conv) => {
    console.log(JSON.stringify(conv?.session?.params, null, 0));
    const { reportDate: reportDateRaw, children } = conv?.session?.params ?? {};
    const reportDateFromRaw = new Date(reportDateRaw.year, reportDateRaw.month - 1, reportDateRaw.day);

    const dateRawMoment = moment(reportDateFromRaw);
    const daysAhead = dateRawMoment.diff(moment(), 'days');
    const isDateNextWeek = daysAhead <= 7 && daysAhead > 0;
    const reportDate = dateRawMoment.subtract(isDateNextWeek ? 1 : 0, 'week').toDate();

    const reports = await findReports(reportDate, children);
    const formattedDate = moment(reportDate).format(DATE_FORMAT);
    const isToday = formattedDate === moment().format(DATE_FORMAT);
    const suffix = isToday ? 'for today' : `on ${formattedDate}`;
    if (reports.length === 0) {
        conv.add(`No reports found for ${listify(children)} ${suffix}.`);
    }
    for (const report of reports) {
        conv.add(readReport(report));
    }
});

function readReport(report: any): string {
    let result = '';
    const todayIWas = report.questions.find((q: any) => q.label === 'Today I Was');
    if (todayIWas) {
        result += `${report.first_name} was ${listify(todayIWas.answer.split(' '))}.`;
    }

    const dispositionNotes = report.questions.find((q: any) => q.label === 'Disposition notes');
    if (dispositionNotes) {
        result += dispositionNotes.answer;
    }

    const mealNotes = report.questions.find((q: any) => q.label === 'Meal Notes');
    if (mealNotes) {
        result += mealNotes.answer;
    }

    const itemsToBring = report.questions.find((q: any) => q.label === 'Items to bring to school');
    if (itemsToBring) {
        result += `Please bring ${listify(itemsToBring.answer.split(' '))}.`;
    }

    return result;
}

async function findReports(date: Date, children: string[]): Promise<any> {
    const reports = [];
    for (const name of children) {
        const report = await findSingleReport(name, date);
        if (!report) continue;
        reports.push(report);
    }

    return reports;
}

async function findSingleReport(first_name: string, date: Date): Promise<any> {
    const params = {
        TableName: process.env.TABLE_NAME,
        Key: {
            pk: formatReportKey(first_name.toLowerCase().trim()),
            sk: moment(date).format('YYYYMMDD'),
        },
    };
    const recentReports = await documentClient.get(params).promise();
    console.log('recentReports', params, recentReports);
    return recentReports.Item;
}

export const googleActionHandler = app;
