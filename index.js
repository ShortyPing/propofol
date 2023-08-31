import * as puppeteer from 'puppeteer'
import * as fs from 'fs'
import * as path from "path"

//----------------------------------------//
const config = {
    email: '',
    password: '',
    ebookId: "",
    headless: true
}
//----------------------------------------//

const ebookUrl = `https://a.digi4school.at/ebook/${config.ebookId}/`

console.log(`Ebook URL: ${ebookUrl}`)

function createDirectories(filePath) {
    const directories = path.dirname(filePath).split(path.sep);
    let currentDirectory = '';

    directories.forEach(directory => {
        currentDirectory = path.join(currentDirectory, directory);
        if (!fs.existsSync(currentDirectory)) {
            fs.mkdirSync(currentDirectory);
        }
    });
}

async function exit() {
    await inst.close()
    process.exit(0)
}

async function gotoPage(name) {
    let xpath

    if (name === 'first') {
        xpath = '//*[@id="btnFirst"]'
    } else if (name === 'last') {
        xpath = '//*[@id="btnLast"]'
    } else if (name === 'next') {
        xpath = '//*[@id="btnNext"]'
    } else {
        console.log(`Unknown page name: ${name}`)
        await exit()
    }

    const lastPageBtn = await page.$x(xpath)

    if (lastPageBtn.length === 0) {
        console.log('The ebook viewer has a flawed design.')
        await exit()
    }

    const navigatePromise = page.waitForNavigation({waitUntil: 'networkidle0', timeout: 0})
    lastPageBtn[0].evaluate((element) => {
        element.dispatchEvent(new MouseEvent('click'))
    })
    await navigatePromise
}

async function findSVGUrl() {
    await page.waitForXPath('/html/body/div[3]/div[2]/div[2]/div[2]/div[2]/object', {
        timeout: 0
    })

    const svg = await page.$x('/html/body/div[3]/div[2]/div[2]/div[2]/div[2]/object')

    if (svg.length === 0) {
        console.log('Cannot find SVG container.')
        await exit()
    }

    return `${ebookUrl}/` + await svg[0].evaluate((domElement) => {
        return domElement.getAttribute('data')
    })
}

const inst = await puppeteer.launch({
    headless: config.headless
})

let page
const pages = await inst.pages()

if (pages.length === 0) {
    page = await inst.newPage();
} else {
    page = pages[0]
}

// Log into the service
await page.goto('https://digi4school.at', {waitUntil: 'networkidle0', timeout: 0})
await page.type('#email', config.email)
await page.type('#password', config.password)
const button = await page.$x('/html/body/div[3]/div/div[1]/div/div[3]/div[2]/form/button')

if (button.length === 0) {
    process.exit(0)
}

// In case of a successful login, we'll be automatically redirected to the ebook list
await button[0].click()

// Check if the login was successful by looking for the logout link
try {
    await page.waitForSelector(' #mytxt > a:nth-child(3)', {
        timeout: 5000
    })
} catch (e) {
    console.log('Failed to login: Are the credentials correct?')
    await exit()
}

console.log(`Login as "${config.email}" successful.`)

// Navigate to the ebook viewer URL
await page.goto(ebookUrl, {
    waitUntil: 'networkidle0',
    timeout: 0
})

console.log('Probing book size ...')

// Get the base url, without any additional tags
const baseUrl = page.url()

// Probe the number of pages
await gotoPage('last')

// Get the number of pages from the URL
const lastPageUrl = page.url()
const lastPageNumber = /\?page=([0-9]+)/.exec(lastPageUrl)

if (!lastPageNumber || lastPageNumber.length !== 2) {
    console.log('Could not analyze URL.')
    await exit()
}

let numberOfPages = Number.parseInt(lastPageNumber[1])

console.log(`Probed number of pages: ${numberOfPages}`)

await gotoPage('first')

console.log('\n----- Beginning download process -----\n')

// Preallocate two tabs for getting SVGs and image files
const svgPage = await inst.newPage()
const imagePage = await inst.newPage()

let svg = null
let imagesCount = 0

for (let i = 1; i < numberOfPages; i++) {
    const svgUrl = await findSVGUrl()

    const res = await svgPage.goto(svgUrl, {
        waitUntil: 'networkidle0',
        timeout: 0
    })

    if (!res) {
        break
    }

    if (res.status() === 404) {
        break
    }

    console.log(`⁕ Getting page: ${i}`)

    const pageFile = `pages/${i}/page.svg`
    svg = (await res.text()).replaceAll('xlink:href', 'href')
    createDirectories(pageFile)
    fs.writeFileSync(pageFile, svg)

    // Get all images referenced in the SVG
    const images = (await svgPage.$$eval('image', img => Array.from(img).map(img => img.href.baseVal)))
        .map(href => [`pages/${i}/${href}`, `${baseUrl}${i}/${href}`])

    if (images.length === 0) {
        console.log('  » No associated image files.')
    } else {
        imagesCount += images.length
        for (let j = 0; j < images.length; j++) {
            const imageUrl = (images[j])[1]
            const imageFile = (images[j])[0]

            const resp = await imagePage.goto(imageUrl, {waitUntil: 'networkidle0', timeout: 0})
            const buffer = await resp.buffer()

            // Create all directories along the way to our target
            createDirectories(imageFile)

            fs.writeFileSync(imageFile, buffer, 'base64')

            console.log(`  » Grabbed ${j + 1}/${images.length} related image files.`)
        }
    }

    await gotoPage('next')
}

console.log(`Done: (${numberOfPages} pages were converted; Downloaded additional ${imagesCount} images in total)`)

await inst.close()