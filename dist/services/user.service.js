const users = [];
export function getUsers(name) {
    return users;
}
export function addUsers(request) {
    const id = Math.round(Math.random() * 100000);
    users.push({ ...request, id });
    return true;
}
