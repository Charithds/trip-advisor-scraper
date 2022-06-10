const fs = require('fs');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const TIMEOUT = 20000; // 20s timeout with puppeteer operations
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/47.0.2526.111 Safari/537.36';
async function newPage(browser) {
  // get a new page
  page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT);
  // spoof user agent
  await page.setUserAgent(USER_AGENT);
  // pretend to be desktop
  await page.setViewport({
    width: 1980,
    height: 1080,
  });
  return page;
}

async function fetchUrl(browser, url) {
  const page = await newPage(browser);
  await page.goto(url, { timeout: TIMEOUT, waitUntil: 'domcontentloaded' });
  const html = await page.content(); // sometimes this seems to hang, so now we create a new page each time
  await page.close();
  return html;
}

async function downloadShootingData(browser, url, page) {
  const htmlFilename = `shots-${page}.html`;

  if (page > 1) {
    let newURL = "";
    let splitUrl = url.split('-');
    
    for (let index = 0; index < splitUrl.length; index++) {
      const element = splitUrl[index];
      newURL = newURL + element;
      if (index == 1) {
        newURL = newURL + `-oa${(page-1) * 30}`
      }
      if (index != splitUrl.length - 1) {
        newURL = newURL + '-';
      }
    }
    url = newURL;
  }

  const fileExists = fs.existsSync(htmlFilename);
  if (fileExists) {
    console.log(
      `Skipping download for ${url} since ${htmlFilename} already exists.`
    );
    return;
  }

  console.log(`Downloading HTML from ${url}...`);
  const html = await fetchUrl(browser, url);
  await fs.promises.writeFile(htmlFilename, html);
}

async function getCount() {
  const htmlFilename = `shots.html`;
  const html = await fs.promises.readFile(htmlFilename);
  const $ = cheerio.load(html);
  return Number($('span.ffdhf.b').text());
}


async function parseShots(index) {
  console.log('Parsing shots HTML...');
  const htmlFilename = `shots-${index}.html`;
  const html = await fs.promises.readFile(htmlFilename);
  const $ = cheerio.load(html);
  const total = Number($('span.ffdhf.b').text());
  const divs = $('div.emrzT.Vt.o').find('div > div > span > a').toArray();
    
  const shots = [];
  divs.forEach(div => {
    const $div = $(div);
    if ($div.attr('class') !== 'bHGqj Cj b') return;
    let href = "";
    let name = "";
    try {
      href = $div.attr('href')
      name = $div.text()
    } catch(err) {
      href = "";
    }
    shots.push({
      href: href,
      name: name
    });
  });
  return shots;
}

async function extractEmail(browser, endUrl) {
  const url = 'https://www.tripadvisor.com' + endUrl;

  console.log(`Downloading HTML from ${url}...`);
  const html = await fetchUrl(browser, url);
  const $ = cheerio.load(html);
  const divs = $('div.bKBJS.Me.enBrh').find('a').toArray();
    
  let finalMailTo = null;
  divs.forEach(div => {
    const $div = $(div);
    if ($div.attr('href') && $div.attr('href')) {
      let mailTo = $div.attr('href');
      if (mailTo.startsWith('mailto:')) {
        finalMailTo = mailTo.split('mailto:')[1].split('?')[0];
      }
    }
  });
  return finalMailTo;
}

async function main() {
  
  let browser = await puppeteer.launch();
  const url = 'https://www.tripadvisor.com/Restaurants-g188644-Brussels.html';

  const shots = [];
  for (let index = 1; index < 2; index++) {
    await downloadShootingData(browser, url, index);
    let newArray = await parseShots(index)
    Array.prototype.push.apply(shots, newArray);
  }
  for (let index = 0; index < shots.length; index++) {
    let mailTo = await extractEmail(browser, shots[index].href);
    shots[index]['email'] = mailTo;
  }
  await fs.promises.writeFile('shots.json', JSON.stringify(shots, null, 2));
  console.log('Done!');
}
main();