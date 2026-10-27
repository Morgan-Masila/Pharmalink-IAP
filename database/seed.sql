USE pharmalink;

-- Demo password for every seeded pharmacy is: demo1234
INSERT INTO pharmacies (name, password_hash, area, latitude, longitude, verified) VALUES
('AfyaCare Pharmacy', '$2b$10$QvQy2GHgVNp03FybB3O.t.MjZQK2pVSW2l2f7KDA7D4MKvwK5PZIO', 'Nairobi CBD', -1.286400, 36.817200, TRUE),
('Westlands MedPoint', '$2b$10$QvQy2GHgVNp03FybB3O.t.MjZQK2pVSW2l2f7KDA7D4MKvwK5PZIO', 'Westlands', -1.264700, 36.803000, TRUE),
('Mtaa Chemist', '$2b$10$QvQy2GHgVNp03FybB3O.t.MjZQK2pVSW2l2f7KDA7D4MKvwK5PZIO', 'Eastleigh', -1.274000, 36.846000, FALSE),
('Lakeview Pharmacy', '$2b$10$QvQy2GHgVNp03FybB3O.t.MjZQK2pVSW2l2f7KDA7D4MKvwK5PZIO', 'Kisumu', -0.091700, 34.768000, TRUE),
('Coast Family Chemist', '$2b$10$QvQy2GHgVNp03FybB3O.t.MjZQK2pVSW2l2f7KDA7D4MKvwK5PZIO', 'Mombasa', -4.052600, 39.665000, TRUE),
('GreenCross Clinic Pharmacy', '$2b$10$QvQy2GHgVNp03FybB3O.t.MjZQK2pVSW2l2f7KDA7D4MKvwK5PZIO', 'Nairobi CBD', -1.283300, 36.816700, TRUE);

INSERT INTO inventory (pharmacy_id, medicine, quantity, price, status) VALUES
(1, 'Amoxicillin', 24, 180, 'In stock'),
(2, 'Amoxicillin', 8, 210, 'Low stock'),
(3, 'Amoxicillin', 0, 195, 'Out of stock'),
(4, 'Insulin glargine', 5, 1280, 'Low stock'),
(5, 'Salbutamol inhaler', 16, 460, 'In stock'),
(6, 'Metformin', 31, 120, 'In stock'),
(1, 'Losartan', 0, 340, 'Out of stock');

INSERT INTO payments (type, amount, status) VALUES
('Monthly pharmacy subscription', 1500, 'Paid'),
('Sponsored listing', 750, 'Paid');