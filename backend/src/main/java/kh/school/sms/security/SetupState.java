package kh.school.sms.security;

import kh.school.sms.auth.AppUserRepository;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicBoolean;

/** Whether an administrator exists yet. While none does, the app is in "setup mode" (docs §4A.3). */
@Component
public class SetupState {
    private final AppUserRepository users;
    private final AtomicBoolean usersExist = new AtomicBoolean(false);

    public SetupState(AppUserRepository users) { this.users = users; }

    /** Only a positive answer is cached; in setup mode each call re-checks the (tiny) table. */
    public boolean usersExist() {
        if (usersExist.get()) return true;
        boolean exist = users.count() > 0;
        if (exist) usersExist.set(true);
        return exist;
    }

    public void markUsersExist() { usersExist.set(true); }
}
