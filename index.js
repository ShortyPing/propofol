import * as puppeteer from 'puppeteer'
import * as fs from 'fs'

//----------------------------------------//
const config = {
    email: 'pw.piotr.wyrwas@gmail.com',
    password: 'piotr2005',
    ebookId: '5357'
}
//----------------------------------------//

fs.exists('pages', (exists) => {
    if (!exists)
        return

    fs.rmdir('pages', {
        recursive: true
    }, () => {
    })
})

fs.mkdir('pages', () => {
})

const ebookUrl = `https://a.digi4school.at/ebook/${config.ebookId}`

function writeToFile(file, value) {
    fs.writeFileSync(file, value)
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
    } else {
        console.log(`Unknown page name: ${name}`)
        await exit()
    }

    const lastPageBtn = await page.$x(xpath)

    if (!lastPageBtn) {
        console.log('The ebook viewer has a flawed design.')
        await exit()
    }

    await lastPageBtn[0].evaluate((element) => {
        element.dispatchEvent(new MouseEvent('click', {}))
    })

    await page.waitForNavigation()
}

const inst = await puppeteer.launch({
    headless: false
})

let page
const pages = await inst.pages()

if (pages.length === 0) {
    page = await inst.newPage();
} else {
    page = pages[0]
}

// Log into the service
await page.goto('https://digi4school.at')
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
    waitUntil: 'domcontentloaded'
})

// Probe the number of pages
await gotoPage('last')

// Get the number of pages from the URL
const lastPageUrl = page.url()
const lastPageNumber = /\?page=([0-9]+)/.exec(lastPageUrl)

if (lastPageNumber.length !== 2) {
    console.log('Could not analyze URL.')
    await exit()
}

let numberOfPages = Number.parseInt(lastPageNumber[1])

console.log(`Number of pages: ${numberOfPages}`)

await gotoPage('first')

while (true) {
}

// Preallocate two tabs for getting SVGs and image files
const svgPage = await inst.newPage()
const imagePage = await inst.newPage()

let svg = null
let i = 1

while (true) {
    const svgUrl = `${ebookUrl}/${i}.svg`
    const res = await svgPage.goto(svgUrl)

    if (!res) {
        break
    }

    if (res.status() === 404) {
        break
    }

    console.log(`⁕ Getting page: ${i}`)

    svg = (await res.text()).replaceAll('xlink:href', 'href')

    const images = [...svg.matchAll(/[0-9/.a-z]+\.(jpg|png)/g)]

    if (images && images.length > 0) {
        for (let j = 0; j < images.length; j++) {
            // Extract the image URL
            const image = (images[j])[0]

            const dir = 'pages/' + image.replaceAll(/[0-9]+\.(jpg|png)/g, '')
            fs.mkdirSync(dir, {
                recursive: true
            })

            let url = `${ebookUrl}/${image}`
            const resp = await imagePage.goto(url)
            const buffer = await resp.buffer()
            fs.writeFileSync('pages/' + image, buffer, 'base64')
        }
    }

    if (images.length > 0) {
        console.log(`  → ${images.length} associated image file` + (images.length === 1 ? '' : 's') + ' downloaded.')
    } else {
        console.log(`  → No associated image files.`)
    }

    writeToFile(`pages/${i}.svg`, svg)

    i++
}

console.log(`Done: (${i - 1} pages converted)`)

await inst.close()