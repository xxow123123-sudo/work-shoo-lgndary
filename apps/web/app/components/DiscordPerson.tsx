import type {DiscordProfile} from '../../lib/discord';

export default function DiscordPerson({profile,fallback,subtitle,badge}:{profile?:DiscordProfile|null;fallback?:string;subtitle?:string;badge?:string}){
  const name=profile?.displayName||fallback||'عضو';
  return <div className="discord-person">
    {profile?.avatarUrl?<img src={profile.avatarUrl} alt={name}/>:<span className="discord-avatar-fallback">{name.slice(0,1).toUpperCase()}</span>}
    <div className="discord-person-copy"><strong>{name}</strong><small>{profile?.username?`@${profile.username}`:subtitle||''}</small></div>
    {badge&&<span className="role-badge">{badge}</span>}
  </div>;
}
