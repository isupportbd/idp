import jwt from 'jsonwebtoken';

async function fetchStatement() {
  const token = jwt.sign(
    { userId: 1, role: 'admin', adminId: 1 },
    'my_super_secret_key_for_idp', // from apps/api/.env
    { expiresIn: '1h' }
  );

  const res = await fetch('http://localhost:3001/api/reports/statement?clientId=13&month=2025-07', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
fetchStatement();
