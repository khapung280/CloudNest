import pg from 'pg';
export function database(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required.');
 return new pg.Pool({connectionString:process.env.DATABASE_URL,max:10,connectionTimeoutMillis:10000,idleTimeoutMillis:30000});
}
