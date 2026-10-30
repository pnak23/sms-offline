package kh.school.sms.auth;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AppUserRepository extends JpaRepository<AppUser, Long> {
    Optional<AppUser> findByUsername(String username);

    /** One administrator today; the recovery key alone identifies the account (docs default 1). */
    Optional<AppUser> findFirstByOrderByIdAsc();
}
