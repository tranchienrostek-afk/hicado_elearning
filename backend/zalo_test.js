const fs = require('fs');
const dotenv = require('dotenv');

// Load env
const envConfig = dotenv.parse(fs.readFileSync('D:/desktop_folder/19_Elearning/.env'));
const token = envConfig.ACCESS_TOKEN;

async function testZalo() {
  try {
    // 1. Lấy danh sách tag
    const tagRes = await fetch('https://openapi.zalo.me/v2.0/oa/tag/gettagsofoa', {
      headers: { 'access_token': token }
    });
    const tagData = await tagRes.json();
    console.log("=== THÔNG TIN TAGS ===");
    console.log(tagData);

    // 2. Lấy danh sách followers
    const follRes = await fetch('https://openapi.zalo.me/v2.0/oa/getfollowers?data={"offset":0,"count":50}', {
      headers: { 'access_token': token }
    });
    const follData = await follRes.json();
    console.log("\n=== DANH SÁCH FOLLOWERS ===");
    console.log(follData);
  } catch (err) {
    console.error(err);
  }
}

testZalo();
