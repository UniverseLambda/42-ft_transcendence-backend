-- Language : psql

-- FETCHING USER IN DATABASE y/n
SELECT * FROM users WHERE uid = '$uid';

-- FETCH USER INFORMATION
SELECT * FROM users WHERE uid = '$uid';

-- CHECK IF A USERNAME EXISTS
SELECT * FROM users WHERE name = '$name'

-- ADD A USER INTO DATABASE
INSERT INTO users (login, nickname, profile_pic, totpsecret, uid)
VALUES ('$login', '$nickname', '$profile_pic', '$totpsecret', '$uid');

-- UPDATE USER LOGIN
UPDATE users SET login = '$login' WHERE uid = '$uid';

-- UPDATE USER WINS AND LOSSES
UPDATE users SET wins = '$wins', losses = '$losses' WHERE uid = '$uid';

-- UPDATE TOTPSECRET
UPDATE users SET totpsecret = '$totpsecret' WHERE uid = '$uid';

-- ADD AN HISTORY ENTRY
INSERT INTO matches_history (id_user1, score_user1, id_user2, score_user2, winner)
VALUES ('$id_user1', '$score_user1', '$id_user2', '$score_user2', '$winner');

-- ADD FRIEND MUTUAL RELATIONSHIP
INSERT INTO friendlist (id_user1, id_user2)
VALUES ('$id_user1', '$id_user2');

-- DROP FRIEND MUTUAL RELATIONSHIP
DELETE FROM friendlist WHERE id_user1 = '$id_user1' AND id_user2 = '$id_user2';

-- FETCH FRIENDLIST OF A SPECIFIC USER
SELECT * FROM friendlist WHERE id_user1 = '$id_user1' OR id_user2 = '$id_user1';

-- ADD A ROW IN THE BLACKLIST TABLE
INSERT INTO blacklist (id_user1, id_user2)
VALUES ('$id_user1', '$id_user2');

-- LIST ROOMS
SELECT room_name FROM rooms;

-- FETCH ROOM INFORMATIONS
SELECT * FROM rooms WHERE room_name = '$room_name';

-- UPDATE ROOM NAME
UPDATE rooms SET room_name = '$room_name' WHERE room_name = '$room_name';

-- UPDATE ROOM PASSWORD
UPDATE rooms SET room_password = '$room_password' WHERE room_name = '$room_name';

-- UPDATE ROOM DESCRIPTION
UPDATE rooms SET description = '$description' WHERE room_name = '$room_name';

-- ADD A ROOM INTO DATABASE
INSERT INTO rooms (room_name, description, room_password, identifiant)
VALUES ('$room_name', '$description', CRYPT('$room_password', GEN_SALT('md5')), '$identifiant');

-- UPDATE ENCRYPTED ROOM PASSWORD
UPDATE rooms SET room_password = CRYPT('$room_password', GEN_SALT('md5')) WHERE room_name = '$room_name';

-- DROP A ROOM FROM DATABASE
DELETE FROM rooms WHERE room_name = '$room_name';

-- CHECK AND AUTHENTICATE USER PASSWORD
SELECT * FROM tbl_TestPassword WHERE password = (CRYPT('$password', password)) AND password = '$password';

-- ADD A MESSAGE INTO DATABASE
INSERT INTO messages (room_id, user_id, content)
VALUES ('$room_id', '$user_id', '$content');

-- FETCH MESSAGES
SELECT * FROM messages WHERE room_id = '$room_id' ORDER BY id DESC LIMIT $limit;

-- FETCH MESSAGES FROM A SPECIFIC USER
SELECT * FROM messages WHERE room_id = '$room_id' AND user_id = '$user_id' ORDER BY id DESC LIMIT $limit;

-- DELETE ALL MESSAGES FROM A SPECIFIC USER IN A ROOM
DELETE FROM messages WHERE room_id = '$room_id' AND user_id = '$user_id';

-- DELETE ALL MESSSAGES FROM A SPECIFIC ROOM
DELETE FROM messages WHERE room_id = '$room_id';

-- DELETE ALL MESSAGES FROM A SPECIFIC USER IN ALL ROOMS
DELETE FROM messages WHERE user_id = '$user_id';

-- FETCH ALL ADMINS
SELECT * FROM rooms_admins;

-- FETCH ADMINS FROM A SPECIFIC ROOM
SELECT user_id FROM room_admins WHERE room_id = '$room_id';

-- ADD ADMIN TO A SPECIFIC ROOM
INSERT INTO room_admins (room_id, user_id)
VALUES ('$room_id', '$user_id');

-- REMOVE ADMIN FROM A SPECIFIC ROOM
DELETE FROM room_admins WHERE room_id = '$room_id' AND user_id = '$user_id';

