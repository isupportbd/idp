import fs from 'fs';
import { db } from './src/db';
import { purchases, users } from './src/db/schema';
import { eq } from 'drizzle-orm';
import * as xlsx from 'xlsx';

async function uploadFile() {
  const filePath = "C:\\Users\\mijan\\Desktop\\My Dashboard_Import By BIN_hs.xlsx";
  const buffer = fs.readFileSync(filePath);
  
  // Create form data payload to send to /api/upload
  const formData = new FormData();
  formData.append('file', new Blob([buffer]), 'upload.xlsx');

  // get token for Admin (ID=5)
  const jwt = require('jsonwebtoken');
  const secret = process.env.JWT_SECRET || 'secret';
  const token = jwt.sign({ userId: 5, role: 'admin', adminId: 5 }, secret, { expiresIn: '1d' });

  try {
    console.log("Uploading file to /api/upload...");
    const uploadRes = await fetch('http://localhost:3000/api/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    
    const uploadData = await uploadRes.json();
    console.log("Parse response:", uploadData.success);

    if (uploadData.success) {
      console.log("Saving data...");
      const saveRes = await fetch('http://localhost:3000/api/upload/save', {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: uploadData.data,
          month: '2026-07',
          isRebate: false
        })
      });
      const saveData = await saveRes.json();
      console.log("Save response:", saveData);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

uploadFile();
