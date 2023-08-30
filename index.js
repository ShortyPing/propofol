import * as puppeteer from 'puppeteer'
import * as fs from 'fs'

fs.exists('pages', (exists) => {
    if (!exists)
        return

    fs.rmdir('pages', {
        recursive: true
    }, () => {
    })
})

const config = {
    email: 'email',
    password: 'password',
    ebookId: 'number',
    // usePrefix: true
}

const ebookUrl = `https://a.digi4school.at/ebook/${config.ebookId}`

function writeToFile(file, value) {
    fs.writeFileSync(file, value)
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

await page.goto('https://digi4school.at')

await page.type('#email', config.email)
await page.type('#password', config.password)
const button = await page.$x('/html/body/div[3]/div/div[1]/div/div[3]/div[2]/form/button')

if (button.length === 0)
    process.exit(0)

await button[0].click()

const svgPage = await inst.newPage()

let svg

fs.mkdir('pages', () => {
})

const imagePage = await inst.newPage()

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