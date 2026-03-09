import { User } from '../models/User';
import { Role } from '../models/Server';

/**
 * Parse gobblygook to readable text
 */
export async function parseNotificationText(text: string): Promise<string> {
    if (!text || typeof text !== 'string') return text;

    let parsedText = text;

    // replace <userid:'id'>
    const userIds = [...new Set([...parsedText.matchAll(/<userid:'([^']+)'>/g)].map(m => m[1]))];
    if (userIds.length > 0) {
        try {
            const users = await User.find({ _id: { $in: userIds } }, 'username').lean();
            const userMap = new Map(users.map(u => [u._id.toString(), u.username]));
            parsedText = parsedText.replace(/<userid:'([^']+)'>/g, (match, id) => {
                const username = userMap.get(id);
                return username ? `@${username}` : '@Unknown';
            });
        } catch (e) {
            parsedText = parsedText.replace(/<userid:'([^']+)'>/g, '@Unknown');
        }
    }

    // replace <roleid:'id'>
    const roleIds = [...new Set([...parsedText.matchAll(/<roleid:'([^']+)'>/g)].map(m => m[1]))];
    if (roleIds.length > 0) {
        try {
            const roles = await Role.find({ _id: { $in: roleIds } }, 'name').lean();
            const roleMap = new Map(roles.map(r => [r._id.toString(), r.name]));
            parsedText = parsedText.replace(/<roleid:'([^']+)'>/g, (match, id) => {
                const roleName = roleMap.get(id);
                return roleName ? `@${roleName}` : '@UnknownRole';
            });
        } catch (e) {
            parsedText = parsedText.replace(/<roleid:'([^']+)'>/g, '@UnknownRole');
        }
    }

    // replace <emoji:name:id>
    parsedText = parsedText.replace(/<emoji:([^:]+):?[^>]*>/g, ':$1:');

    // replace <everyone>
    parsedText = parsedText.replace(/<everyone>/g, '@everyone');

    return parsedText;
}
