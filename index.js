const puppeteer = require('puppeteer');
const fs = require('fs');

const DownloadsFolder = 'downloads'

function log(text) {
  console.log(text)
}

function processFinishedRedirectIntercepted(interceptedRequest) {
  const intercepted = interceptedRequest.url()
  return intercepted.includes(`return-url=/`)
}

async function downloadFile(url) {
  log('Downloading file')
  return new Promise(async (resolve, reject) => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page._client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: DownloadsFolder,
    });
    page.on('response', async (r) => {
      if(processFinishedRedirectIntercepted(r)) {
        log('Process finished intercepted')
        await page.waitForTimeout(5000)
        await page.click('#block-system-main > p > a')
        await page.waitForTimeout(5000)
        clearTimeout(timeout)
        browser.close()
        resolve()
      }
    });
    await page.goto(url)
    const timeout = setTimeout(async () => {
      browser.close();
      reject('Download link not found after 60 seconds')
    }, 120000)
  })
}

async function getFetchedData() {
  return new Promise((resolve) => {
    const files = fs.readdirSync(DownloadsFolder)
    log('Opening file', files[0])
    const content = fs.readFileSync(`${DownloadsFolder}/${files[0]}`, 'utf8')
    resolve(content.split('\n').map(r => r.split(",").map((c) => c.replace(/[“”]/g, '').replace(/[‘’]/g,"").replace(/"/g, ''))))
  })  
}

async function getFileFromS3(bucket, file, isS3Enabled = true) {
  return new Promise(async (resolve, reject) => {
    if (isS3Enabled) {
      try {
        const params = {
            Bucket: bucket,
            Key: file
        };
        const data = await s3.getObject(params).promise();
        resolve(data)
      } catch (error) {
        reject(error)
      }
    } else {
      resolve()
    }
  })
}

function hasDataChanged(a, b, isS3Enabled = true) {
  if (isS3Enabled) {
    const lastIdInA = a[1][0]
    const lastIdInB = b[1][0]
    return lastIdInA !== lastIdInB
  } else {
    return true
  }
}

async function putFileToS3(bucket, file, data, isS3Enabled = true) {
  return new Promise(async (resolve, reject) => {
    if (isS3Enabled) {
      try {
        const destparams = {
          Bucket: bucket,
          Key: file,
          Body: data,
          ContentType: "text"
        };
      
        await s3.putObject(destparams).promise();
        resolve()
      } catch (error) {
        reject(error)
      }
    } else {
      resolve()
    }
  })
}

async function main() {

  const bucketName = process.env.S3Bucket
  const fileName = process.env.FileName
  const fileURL = process.env.FileURL
  const isS3Enabled = !!process.env.isS3Enabled

  try {
    await downloadFile(fileURL);
    const fetchedData = await getFetchedData();
    const lastFetchedData = await getFileFromS3(bucketName, fileName, isS3Enabled)
    if (hasDataChanged(lastFetchedData, fetchedData, isS3Enabled)) {
      console.log('Different data!');
      putFileToS3(bucketName, fileName, fileURL, isS3Enabled)
      // TODO: Fetch the Twitter keys from Secrets Manager and send tweets
    }
  } catch (error) {
    log(error)
  }

}

main()

exports.handler = main