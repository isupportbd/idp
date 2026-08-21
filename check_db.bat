@echo off
echo y | D:\Softwares\plink.exe -ssh -pw "123@Sylhet" mijan@103.175.133.171 "echo connected" 2>&1
echo ---
D:\Softwares\plink.exe -batch -ssh -pw "123@Sylhet" mijan@103.175.133.171 "psql -U idp -d idp -c 'SELECT COUNT(*) as users FROM users;' -c 'SELECT COUNT(*) as purchases FROM purchases;' -c 'SELECT DISTINCT month FROM purchases ORDER BY month;' -c 'SELECT id, name, role FROM users;'"
