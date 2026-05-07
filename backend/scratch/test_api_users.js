const axios = require('axios');

async function test() {
  try {
    // 1. Login as admin
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      username: 'admin', // assuming default admin username
      password: 'password' // assuming default password
    });
    const token = loginRes.data.token;
    console.log('Logged in as admin');

    // 2. Fetch users
    const usersRes = await axios.get('http://localhost:5000/api/users', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('Users count:', usersRes.data.length);
    const hungUser = usersRes.data.find(u => u.username === 'gv1' || u.name === 'Trần Văn Hùng');
    console.log('Hùng user in /api/users:', JSON.stringify(hungUser, null, 2));
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

test();
